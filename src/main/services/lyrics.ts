import { createHash } from 'crypto'
import * as mm from 'music-metadata'
import type * as library from './library'
import { lookupSidecarLyrics } from './lyricsSidecar'
import {
  createLyricsPayload,
  normalizeLyricsText,
  parseLyricsText,
  sanitizeSyncLines,
  toPlainLyricsFromLines
} from './lyricsParsing'
import {
  BetterLyricsProvider,
  GeniusProvider,
  KuGouProvider,
  NetEaseProvider,
  type LyricsSearchResult
} from './lyricsProviders'
import { validateResult } from './lyricsValidation'
import {
  LrclibLookupCoordinator,
  createLrclibClientConfig,
  normalizeLrclibMetadataText
} from './lyricsLrclib'
import type { LrclibLookupResult } from './lyricsLrclib'
import {
  XlrcdbLookupCoordinator,
  createXlrcdbClientConfig,
  type XlrcdbLookupResult
} from './lyricsXlrcdb'
import type {
  LyricsFormat,
  LyricsLine,
  LyricsManualClearResult,
  LyricsManualImportResult,
  LyricsLookupResult,
  LyricsOffsetSetResult,
  LyricsPayload,
  LyricsStatus,
  LyricsTrackOverride,
  LyricsTrackQuery,
  OnlineLyricsCandidate
} from '../../types/lyrics'
import {
  LRCLIB_OFFICIAL_BASE_URL,
  normalizeLrclibBaseUrl
} from '../../types/lyrics'

const MAX_TRACK_OFFSET_MS = 3_600_000

export interface LyricsServiceLibraryApi {
  getLyricsTrackOverride: (trackPath: string) => library.LyricsTrackOverrideEntry | null
  upsertLyricsTrackManual: (trackPaths: string[], input: library.LyricsTrackManualInput) => Promise<number>
  clearLyricsTrackManual: (trackPaths: string[]) => Promise<number>
  setLyricsTrackSyncOffset: (trackPaths: string[], offsetMs: number) => Promise<number>
  getLyricsCache: (trackPath: string, metadataSignature?: string) => library.LyricsCacheEntry | null
  upsertLyricsCache: (entry: library.LyricsCacheUpsertInput) => Promise<void>
  getTrackByPath?: (trackPath: string) => library.DbTrack | null
}

type LyricsOnlineLookupResult = LrclibLookupResult | XlrcdbLookupResult

export interface LyricsOnlineLookupProvider {
  lookup: (
    query: LyricsTrackQuery,
    lookupKey: string,
    options?: { forceRefresh?: boolean }
  ) => Promise<LyricsOnlineLookupResult>
  setBaseUrl?: (baseUrl: string) => void
}

interface LyricsServiceOptions {
  enabled: boolean
  appVersion: string
  lrclibBaseUrl?: string
  requestTimeoutMs?: number
  now?: () => number
  onStatusChange?: (status: LyricsStatus) => void
  libraryApi: LyricsServiceLibraryApi
  sidecarLookup?: typeof lookupSidecarLyrics
  embeddedResolver?: typeof resolveEmbeddedLyrics
  xlrcdbProvider?: LyricsOnlineLookupProvider
  lrclibProvider?: LyricsOnlineLookupProvider
}

function normalizeText(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const normalized = value.replace(/\s+/g, ' ').trim()
  return normalized.length > 0 ? normalized : null
}

function normalizeMatchKey(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function buildQueryVariants(title: string, artist: string): Array<{ title: string; artist: string }> {
  const cleanTitle = title
    .replace(/\s*\(.*?\)\s*/g, ' ')
    .replace(/\s*\[.*?\]\s*/g, ' ')
    .replace(/\b(?:feat\.|ft\.|featuring)\b.*$/i, ' ')
    .split(' - ')[0]
    .replace(/\s+/g, ' ')
    .trim()

  const cleanArtist = artist
    .split('&')[0]
    .split(',')[0]
    .split(/\s+[xX]\s+/)[0]
    .split(/\s+feat/i)[0]
    .replace(/\s+/g, ' ')
    .trim()

  const variants: Array<{ title: string; artist: string }> = [
    { title: title.trim(), artist: artist.trim() },
    { title: cleanTitle, artist: artist.trim() },
    { title: cleanTitle, artist: cleanArtist },
    { title: title.trim(), artist: cleanArtist }
  ]

  const seen = new Set<string>()
  return variants.filter((v) => {
    if (!v.title || !v.artist) return false
    const key = `${v.title.toLowerCase()}|||${v.artist.toLowerCase()}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function normalizeDurationSeconds(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
    return Math.round(value)
  }
  if (typeof value === 'string') {
    const parsed = Number(value)
    if (Number.isFinite(parsed) && parsed >= 0) {
      return Math.round(parsed)
    }
  }
  return null
}

function normalizeTrackPathList(trackPaths: string[]): string[] {
  const normalized = trackPaths
    .map((trackPath) => trackPath.trim())
    .filter((trackPath) => trackPath.length > 0)
  return Array.from(new Set(normalized))
}

function hasManualLyricsOverride(entry: {
  plainLyrics: string | null
  syncedLyrics: string | null
  syncedLines: LyricsLine[]
}): boolean {
  return (
    entry.plainLyrics !== null
    || entry.syncedLyrics !== null
    || entry.syncedLines.length > 0
  )
}

function applySyncOffsetToLines(lines: LyricsLine[], offsetMs: number): LyricsLine[] {
  if (lines.length === 0 || offsetMs === 0) return lines

  const shifted = lines.map((line): LyricsLine => {
    const timestampMs = Math.max(0, line.timestampMs + offsetMs)
    if (line.kind === 'silence') {
      return { timestampMs, text: '', kind: 'silence' }
    }

    return {
      ...line,
      timestampMs,
      words: line.words?.map((word) => ({
        ...word,
        timestampMs: Math.max(0, word.timestampMs + offsetMs)
      }))
    }
  })
  shifted.sort((left, right) => left.timestampMs - right.timestampMs)
  return shifted
}

function applyTrackOffsetToPayload(payload: LyricsPayload, offsetMs: number): LyricsPayload {
  if (offsetMs === 0 || payload.syncedLines.length === 0) return payload
  return {
    ...payload,
    syncedLines: applySyncOffsetToLines(payload.syncedLines, offsetMs)
  }
}

function createMetadataSignature(query: LyricsTrackQuery): string {
  const title = normalizeMatchKey(query.title)
  const artist = normalizeMatchKey(query.artist)
  const album = normalizeMatchKey(query.album ?? '')
  const duration = normalizeDurationSeconds(query.durationSeconds) ?? -1
  const hash = createHash('sha1')
  hash.update(`${title}\u0000${artist}\u0000${album}\u0000${duration}`)
  return hash.digest('hex')
}

async function resolveEmbeddedLyrics(trackPath: string): Promise<LyricsPayload | null> {
  try {
    const metadata = await mm.parseFile(trackPath, { skipCovers: true })
    const lyricTags = Array.isArray(metadata.common.lyrics) ? metadata.common.lyrics : []
    if (lyricTags.length === 0) return null

    let plainLyrics: string | null = null
    let bestSyncedLines: LyricsLine[] = []
    for (const lyricTag of lyricTags) {
      if (!plainLyrics) {
        plainLyrics = normalizeLyricsText(lyricTag.text)
      }

      const syncedLines = sanitizeSyncLines(lyricTag.syncText)
      if (syncedLines.length > bestSyncedLines.length) {
        bestSyncedLines = syncedLines
      }
    }

    const syncedLyrics = toPlainLyricsFromLines(bestSyncedLines)
    return createLyricsPayload('embedded', null, bestSyncedLines.length > 0 ? 'lrc' : 'plain', plainLyrics, syncedLyrics, bestSyncedLines)
  } catch {
    return null
  }
}

export class LyricsService {
  private enabled: boolean
  private lrclibBaseUrl: string
  private lastError: string | null = null
  private readonly libraryApi: LyricsServiceLibraryApi
  private readonly sidecarLookup: typeof lookupSidecarLyrics
  private readonly embeddedResolver: typeof resolveEmbeddedLyrics
  private readonly xlrcdb: LyricsOnlineLookupProvider
  private readonly lrclib: LyricsOnlineLookupProvider
  private readonly onStatusChange?: (status: LyricsStatus) => void

  constructor(options: LyricsServiceOptions) {
    this.enabled = Boolean(options.enabled)
    this.lrclibBaseUrl = normalizeLrclibBaseUrl(options.lrclibBaseUrl ?? LRCLIB_OFFICIAL_BASE_URL)
    this.libraryApi = options.libraryApi
    this.sidecarLookup = options.sidecarLookup ?? lookupSidecarLyrics
    this.embeddedResolver = options.embeddedResolver ?? resolveEmbeddedLyrics
    this.xlrcdb = options.xlrcdbProvider ?? new XlrcdbLookupCoordinator(createXlrcdbClientConfig({
      requestTimeoutMs: options.requestTimeoutMs,
      now: options.now
    }))
    this.lrclib = options.lrclibProvider ?? new LrclibLookupCoordinator(createLrclibClientConfig({
      appVersion: options.appVersion,
      baseUrl: this.lrclibBaseUrl,
      requestTimeoutMs: options.requestTimeoutMs,
      now: options.now
    }))
    this.onStatusChange = options.onStatusChange
  }

  getStatus(): LyricsStatus {
    if (!this.enabled) {
      return {
        enabled: false,
        provider: 'xlrcdb',
        lrclibBaseUrl: this.lrclibBaseUrl,
        statusMessage: 'Online lyrics lookup is disabled. Musaic will only use local lyrics and embedded lyrics.',
        lastError: this.lastError
      }
    }

    if (this.lastError) {
      return {
        enabled: true,
        provider: 'xlrcdb',
        lrclibBaseUrl: this.lrclibBaseUrl,
        statusMessage: 'Online lyrics lookup is enabled with XLRCDB and LRCLIB fallback, but the last request failed.',
        lastError: this.lastError
      }
    }

    return {
      enabled: true,
      provider: 'xlrcdb',
      lrclibBaseUrl: this.lrclibBaseUrl,
      statusMessage: 'Online lyrics lookup is enabled with XLRCDB and LRCLIB fallback.',
      lastError: null
    }
  }

  applyConfig(enabled: boolean, lrclibBaseUrl: string = this.lrclibBaseUrl): LyricsStatus {
    this.enabled = Boolean(enabled)
    const normalizedBaseUrl = normalizeLrclibBaseUrl(lrclibBaseUrl)
    if (normalizedBaseUrl !== this.lrclibBaseUrl) {
      this.lrclibBaseUrl = normalizedBaseUrl
      this.lrclib.setBaseUrl?.(normalizedBaseUrl)
      this.lastError = null
    }
    if (!this.enabled) {
      this.lastError = null
    }
    this.emitStatus()
    return this.getStatus()
  }

  private emitStatus(): void {
    this.onStatusChange?.(this.getStatus())
  }

  private setLastError(error: string | null): void {
    if (this.lastError === error) return
    this.lastError = error
    this.emitStatus()
  }

  getTrackOverride(trackPath: string): LyricsTrackOverride {
    const normalizedTrackPath = normalizeText(trackPath)
    if (!normalizedTrackPath) {
      return {
        trackPath: '',
        hasManualLyrics: false,
        format: 'plain',
        plainLyrics: null,
        syncedLyrics: null,
        syncedLines: [],
        syncOffsetMs: 0,
        updatedAt: null
      }
    }

    const override = this.libraryApi.getLyricsTrackOverride(normalizedTrackPath)
    if (!override) {
      return {
        trackPath: normalizedTrackPath,
        hasManualLyrics: false,
        format: 'plain',
        plainLyrics: null,
        syncedLyrics: null,
        syncedLines: [],
        syncOffsetMs: 0,
        updatedAt: null
      }
    }

    const hasManualLyrics = hasManualLyricsOverride(override)
    return {
      trackPath: override.trackPath,
      hasManualLyrics,
      format: override.format,
      plainLyrics: override.plainLyrics,
      syncedLyrics: override.syncedLyrics,
      syncedLines: override.syncedLines,
      syncOffsetMs: override.syncOffsetMs,
      updatedAt: override.updatedAt
    }
  }

  async importManualLyrics(
    trackPaths: string[],
    lyricsText: string,
    format: LyricsFormat = 'lrc'
  ): Promise<LyricsManualImportResult> {
    const normalizedTrackPaths = normalizeTrackPathList(trackPaths)
    if (normalizedTrackPaths.length === 0) {
      throw new Error('Select at least one track before importing lyrics.')
    }

    const payload = parseLyricsText(lyricsText, 'manual', format)
    if (!payload) {
      throw new Error('Selected lyrics file is empty or could not be parsed.')
    }

    const updated = await this.libraryApi.upsertLyricsTrackManual(normalizedTrackPaths, {
      format: payload.format,
      plainLyrics: payload.plainLyrics,
      syncedLyrics: payload.syncedLyrics,
      syncedLines: payload.syncedLines
    })

    return {
      updated,
      hasPlainLyrics: payload.plainLyrics !== null,
      hasSyncedLyrics: payload.syncedLines.length > 0
    }
  }

  async clearManualLyrics(trackPaths: string[]): Promise<LyricsManualClearResult> {
    const normalizedTrackPaths = normalizeTrackPathList(trackPaths)
    if (normalizedTrackPaths.length === 0) {
      return { cleared: 0 }
    }

    const cleared = await this.libraryApi.clearLyricsTrackManual(normalizedTrackPaths)
    return { cleared }
  }

  async setTrackOffset(trackPaths: string[], offsetMs: number): Promise<LyricsOffsetSetResult> {
    const normalizedTrackPaths = normalizeTrackPathList(trackPaths)
    if (normalizedTrackPaths.length === 0) {
      return { updated: 0, offsetMs: 0 }
    }

    if (!Number.isFinite(offsetMs)) {
      throw new Error('Sync offset must be a finite integer value.')
    }

    const normalizedOffset = Math.trunc(offsetMs)
    if (normalizedOffset < -MAX_TRACK_OFFSET_MS || normalizedOffset > MAX_TRACK_OFFSET_MS) {
      throw new Error(`Sync offset must be between -${MAX_TRACK_OFFSET_MS} and ${MAX_TRACK_OFFSET_MS} ms.`)
    }

    const updated = await this.libraryApi.setLyricsTrackSyncOffset(normalizedTrackPaths, normalizedOffset)
    return {
      updated,
      offsetMs: normalizedOffset
    }
  }

  async searchAllProviders(query: LyricsTrackQuery): Promise<OnlineLyricsCandidate[]> {
    const title = normalizeLrclibMetadataText(query.title)
    const artist = normalizeLrclibMetadataText(query.artist)
    const album = normalizeLrclibMetadataText(query.album)
    const durationSeconds = normalizeDurationSeconds(query.durationSeconds) ?? undefined
    const targetDurationMs = (durationSeconds ?? -1) * 1000

    if (!title && !artist) return []

    const normalizedQuery: LyricsTrackQuery = {
      path: query.path || '',
      title: title || '',
      artist: artist || '',
      album: album ?? undefined,
      durationSeconds
    }

    const queryList = buildQueryVariants(title || '', artist || '')
    const candidates: OnlineLyricsCandidate[] = []
    const seenTexts = new Set<string>()

    const helperExtractSample = (plainLyrics: string | null, syncedLyrics: string | null): string => {
      const source = plainLyrics || (syncedLyrics ? syncedLyrics.replace(/\[\d+:\d+(?:\.\d+)?\]/g, '') : '')
      if (!source) return ''
      return source
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0 && !line.startsWith('[ti:') && !line.startsWith('[ar:') && !line.startsWith('[al:'))
        .slice(0, 4)
        .join('\n')
    }

    // 1. XLRCDB
    const xlrcdbPromise = (async () => {
      try {
        const res = await this.xlrcdb.lookup(normalizedQuery, createMetadataSignature(normalizedQuery))
        if (res.status === 'hit' && res.lyrics) {
          const sample = helperExtractSample(res.lyrics.plainLyrics, res.lyrics.syncedLyrics)
          const textKey = (res.lyrics.syncedLyrics || res.lyrics.plainLyrics || '').slice(0, 200)
          if (!seenTexts.has(textKey)) {
            seenTexts.add(textKey)
            candidates.push({
              id: 'xlrcdb-hit',
              provider: 'xlrcdb',
              providerLabel: 'XLRCDB',
              title: normalizedQuery.title,
              artist: normalizedQuery.artist,
              album: normalizedQuery.album,
              durationMs: targetDurationMs > 0 ? targetDurationMs : null,
              isSynced: true,
              hasWordTiming: res.lyrics.syncedLines.some((l) => Boolean(l.words && l.words.length > 0)),
              hasTranslations: res.lyrics.syncedLines.some((l) => Boolean(l.translations && l.translations.length > 0)),
              hasFurigana: res.lyrics.syncedLines.some((l) => Boolean(l.furigana && l.furigana.length > 0)),
              format: 'xlrc',
              sampleLyrics: sample,
              plainLyrics: res.lyrics.plainLyrics,
              syncedLyrics: res.lyrics.syncedLyrics
            })
          }
        }
      } catch {
        // ignore
      }
    })()

    // 2. LRCLIB (Search API)
    const lrclibPromise = (async () => {
      try {
        if (this.lrclib && typeof (this.lrclib as any).searchCandidates === 'function') {
          const lrclibResults: OnlineLyricsCandidate[] = await (this.lrclib as any).searchCandidates(normalizedQuery)
          for (const item of lrclibResults) {
            const textKey = (item.syncedLyrics || item.plainLyrics || '').slice(0, 200)
            if (!seenTexts.has(textKey)) {
              seenTexts.add(textKey)
              candidates.push(item)
            }
          }
        }
      } catch {
        // ignore
      }
    })()

    // 3. Fallback Providers: BetterLyrics, KuGou, NetEase, Genius
    const providers = [
      new BetterLyricsProvider(),
      new KuGouProvider(),
      new NetEaseProvider(),
      new GeniusProvider()
    ]

    const fallbackPromises = queryList.map(async (q) => {
      const qQuery: LyricsTrackQuery = {
        ...normalizedQuery,
        title: q.title,
        artist: q.artist
      }

      await Promise.allSettled(
        providers.map(async (provider) => {
          try {
            const results = await provider.searchAll(qQuery)
            for (let i = 0; i < results.length; i++) {
              const res = results[i]
              const payload = parseLyricsText(res.lyrics, 'online', 'lrc')
              if (!payload) continue

              const isSynced = res.isSynced || payload.syncedLines.length > 0
              const sample = helperExtractSample(payload.plainLyrics, payload.syncedLyrics)
              const textKey = (payload.syncedLyrics || payload.plainLyrics || '').slice(0, 200)

              if (!seenTexts.has(textKey)) {
                seenTexts.add(textKey)
                candidates.push({
                  id: `${provider.name.toLowerCase()}-${q.title}-${i}-${Math.random().toString(36).slice(2, 6)}`,
                  provider: provider.name.toLowerCase() as any,
                  providerLabel: provider.name,
                  title: res.trackTitle || q.title,
                  artist: res.artistName || q.artist,
                  durationMs: res.durationMs || null,
                  isSynced,
                  format: isSynced ? 'lrc' : 'plain',
                  sampleLyrics: sample,
                  plainLyrics: payload.plainLyrics,
                  syncedLyrics: payload.syncedLyrics
                })
              }
            }
          } catch {
            // ignore
          }
        })
      )
    })

    await Promise.allSettled([xlrcdbPromise, lrclibPromise, ...fallbackPromises])

    const providerPriority: Record<string, number> = {
      xlrcdb: 1,
      lrclib: 2,
      betterlyrics: 3,
      kugou: 4,
      netease: 5,
      genius: 6
    }

    candidates.sort((a, b) => {
      // 1. Synced over plain
      if (a.isSynced && !b.isSynced) return -1
      if (!a.isSynced && b.isSynced) return 1

      // 2. Duration match closeness (if duration is known)
      if (targetDurationMs > 0 && a.durationMs && b.durationMs) {
        const diffA = Math.abs(a.durationMs - targetDurationMs)
        const diffB = Math.abs(b.durationMs - targetDurationMs)
        if (Math.abs(diffA - diffB) > 3000) {
          return diffA - diffB
        }
      }

      // 3. Provider priority
      const prioA = providerPriority[a.provider] || 99
      const prioB = providerPriority[b.provider] || 99
      return prioA - prioB
    })

    return candidates
  }

  async applyCandidate(
    trackPath: string,
    candidate: OnlineLyricsCandidate
  ): Promise<LyricsLookupResult> {
    const normalizedPath = normalizeText(trackPath)
    if (!normalizedPath) {
      return { status: 'not_found', reason: 'embedded-missing' }
    }

    const format = candidate.format || (candidate.isSynced ? 'lrc' : 'plain')
    const rawLyrics = candidate.syncedLyrics || candidate.plainLyrics || ''
    const payload = parseLyricsText(rawLyrics, 'online', format)
    if (!payload) {
      return { status: 'not_found', reason: 'provider-not-found' }
    }

    payload.provider = candidate.provider

    const trackOverride = this.libraryApi.getLyricsTrackOverride(normalizedPath)
    const trackOffsetMs = trackOverride?.syncOffsetMs ?? 0
    const track = this.libraryApi.getTrackByPath?.(normalizedPath)
    const metadataSignature = track
      ? createMetadataSignature({
          path: normalizedPath,
          title: track.title,
          artist: track.artist,
          album: track.album ?? undefined,
          durationSeconds: track.duration
        })
      : createMetadataSignature({
          path: normalizedPath,
          title: candidate.title || '',
          artist: candidate.artist || '',
          album: candidate.album || undefined,
          durationSeconds: candidate.durationMs ? Math.round(candidate.durationMs / 1000) : undefined
        })

    await this.libraryApi.upsertLyricsCache({
      trackPath: normalizedPath,
      metadataSignature,
      status: 'hit',
      source: 'online',
      provider: candidate.provider,
      plainLyrics: payload.plainLyrics,
      syncedLyrics: payload.syncedLyrics,
      syncedLines: payload.syncedLines
    })

    const embedded = await this.embeddedResolver(normalizedPath)

    return {
      status: 'hit',
      lyrics: applyTrackOffsetToPayload(payload, trackOffsetMs),
      cached: false,
      availableSources: embedded ? ['online', 'embedded'] : ['online'],
      embeddedAlternative: embedded ? applyTrackOffsetToPayload(embedded, trackOffsetMs) : null
    }
  }

  async selectSource(
    trackPath: string,
    source: 'embedded' | 'online'
  ): Promise<LyricsLookupResult | null> {
    const normalizedPath = normalizeText(trackPath)
    if (!normalizedPath) return null

    const trackOverride = this.libraryApi.getLyricsTrackOverride(normalizedPath)
    const trackOffsetMs = trackOverride?.syncOffsetMs ?? 0
    const track = this.libraryApi.getTrackByPath?.(normalizedPath)
    const metadataSignature = track
      ? createMetadataSignature({
          path: normalizedPath,
          title: track.title,
          artist: track.artist,
          album: track.album ?? undefined,
          durationSeconds: track.duration
        })
      : null

    const embedded = await this.embeddedResolver(normalizedPath)

    if (source === 'embedded') {
      if (!embedded) return null
      if (metadataSignature) {
        await this.libraryApi.upsertLyricsCache({
          trackPath: normalizedPath,
          metadataSignature,
          status: 'hit',
          source: 'embedded',
          provider: embedded.provider,
          plainLyrics: embedded.plainLyrics,
          syncedLyrics: embedded.syncedLyrics,
          syncedLines: embedded.syncedLines
        })
      }
      return {
        status: 'hit',
        lyrics: applyTrackOffsetToPayload(embedded, trackOffsetMs),
        cached: false,
        availableSources: ['embedded']
      }
    } else {
      // source === 'online'
      if (!this.enabled) return null
      const cached = metadataSignature ? this.libraryApi.getLyricsCache(normalizedPath, metadataSignature) : null
      if (cached && cached.status === 'hit' && cached.source !== 'embedded') {
        const cachedResult = this.createLookupResultFromCache(cached, trackOffsetMs)
        if (cachedResult && cachedResult.status === 'hit') {
          return {
            ...cachedResult,
            availableSources: embedded ? ['online', 'embedded'] : (cachedResult.availableSources || ['online']),
            embeddedAlternative: embedded ? applyTrackOffsetToPayload(embedded, trackOffsetMs) : null
          }
        }
      }
      if (track) {
        return this.getForTrack(
          {
            path: normalizedPath,
            title: track.title,
            artist: track.artist,
            album: track.album ?? undefined,
            durationSeconds: track.duration
          },
          { preferSource: 'online', forceRefresh: true }
        )
      }
      return null
    }
  }

  async getForTrack(
    query: LyricsTrackQuery,
    options: { forceRefresh?: boolean; preferSource?: 'auto' | 'embedded' | 'online' } = {}
  ): Promise<LyricsLookupResult> {
    const path = normalizeText(query.path)
    const title = normalizeLrclibMetadataText(query.title)
    const artist = normalizeLrclibMetadataText(query.artist)
    const album = normalizeLrclibMetadataText(query.album)
    const durationSeconds = normalizeDurationSeconds(query.durationSeconds) ?? undefined

    if (!path || !title || !artist) {
      return {
        status: 'not_found',
        reason: 'embedded-missing'
      }
    }

    const normalizedQuery: LyricsTrackQuery = {
      path,
      title,
      artist,
      album: album ?? undefined,
      durationSeconds
    }
    const metadataSignature = createMetadataSignature(normalizedQuery)
    const trackOverride = this.libraryApi.getLyricsTrackOverride(path)
    const trackOffsetMs = trackOverride?.syncOffsetMs ?? 0
    let lrclibCached: library.LyricsCacheEntry | null = null
    const preferSource = query.preferSource ?? options.preferSource ?? 'auto'

    if (trackOverride && hasManualLyricsOverride(trackOverride)) {
      const manualPayload = createLyricsPayload(
        'manual',
        null,
        trackOverride.format,
        trackOverride.plainLyrics,
        trackOverride.syncedLyrics,
        trackOverride.syncedLines
      )

      if (manualPayload) {
        return {
          status: 'hit',
          lyrics: applyTrackOffsetToPayload(manualPayload, trackOffsetMs),
          cached: false,
          availableSources: ['manual']
        }
      }
    }

    if (preferSource === 'embedded') {
      const embedded = await this.embeddedResolver(path)
      if (embedded) {
        return {
          status: 'hit',
          lyrics: applyTrackOffsetToPayload(embedded, trackOffsetMs),
          cached: false,
          availableSources: ['embedded']
        }
      }
      return {
        status: 'not_found',
        reason: 'embedded-missing'
      }
    }

    if (preferSource === 'online') {
      if (!this.enabled) {
        return {
          status: 'not_found',
          reason: 'online-disabled'
        }
      }
      return this.lookupOnlineLyrics(normalizedQuery, metadataSignature, options, trackOffsetMs, lrclibCached)
    }

    const sidecarLyrics = await this.sidecarLookup(path)
    if (sidecarLyrics) {
      this.setLastError(null)
      return {
        ...sidecarLyrics,
        lyrics: applyTrackOffsetToPayload(sidecarLyrics.lyrics, trackOffsetMs),
        availableSources: [sidecarLyrics.lyrics.source]
      }
    }

    if (!options.forceRefresh) {
      const cached = this.libraryApi.getLyricsCache(path, metadataSignature)
      if (cached) {
        if (cached.source === 'lrclib' && this.enabled) {
          lrclibCached = cached
        } else if (cached.source !== 'embedded' && cached.status === 'hit') {
          const cachedResult = this.createLookupResultFromCache(cached, trackOffsetMs)
          if (cachedResult && cachedResult.status === 'hit') {
            const embedded = await this.embeddedResolver(path)
            this.setLastError(null)
            return {
              ...cachedResult,
              availableSources: embedded ? ['online', 'embedded'] : (cachedResult.availableSources || ['online']),
              embeddedAlternative: embedded ? applyTrackOffsetToPayload(embedded, trackOffsetMs) : null
            }
          }
        }
      }
    }

    const embedded = await this.embeddedResolver(path)
    if (embedded) {
      const isEmbeddedSynced = embedded.syncedLines.length > 0

      // If embedded lyrics are already synced or online is disabled, use embedded
      if (isEmbeddedSynced || !this.enabled) {
        this.setLastError(null)
        await this.libraryApi.upsertLyricsCache({
          trackPath: path,
          metadataSignature,
          status: 'hit',
          source: 'embedded',
          provider: embedded.provider,
          plainLyrics: embedded.plainLyrics,
          syncedLyrics: embedded.syncedLyrics,
          syncedLines: embedded.syncedLines
        })
        return {
          status: 'hit',
          lyrics: applyTrackOffsetToPayload(embedded, trackOffsetMs),
          cached: false,
          availableSources: ['embedded']
        }
      }

      // Embedded lyrics exist but are unsynced: check online providers for rich synced lyrics!
      const onlineResult = await this.lookupOnlineLyrics(
        normalizedQuery,
        metadataSignature,
        options,
        trackOffsetMs,
        lrclibCached
      )

      if (onlineResult.status === 'hit' && onlineResult.lyrics.syncedLines.length > 0) {
        return {
          status: 'hit',
          lyrics: onlineResult.lyrics,
          cached: onlineResult.cached,
          availableSources: ['online', 'embedded'],
          embeddedAlternative: applyTrackOffsetToPayload(embedded, trackOffsetMs)
        }
      }

      // Online lookup did not find synced lyrics; fall back to embedded plain lyrics
      this.setLastError(null)
      await this.libraryApi.upsertLyricsCache({
        trackPath: path,
        metadataSignature,
        status: 'hit',
        source: 'embedded',
        provider: embedded.provider,
        plainLyrics: embedded.plainLyrics,
        syncedLyrics: embedded.syncedLyrics,
        syncedLines: embedded.syncedLines
      })
      return {
        status: 'hit',
        lyrics: applyTrackOffsetToPayload(embedded, trackOffsetMs),
        cached: false,
        availableSources: ['embedded']
      }
    }

    if (!this.enabled) {
      return {
        status: 'not_found',
        reason: 'online-disabled'
      }
    }

    return this.lookupOnlineLyrics(normalizedQuery, metadataSignature, options, trackOffsetMs, lrclibCached)
  }

  private async lookupOnlineLyrics(
    normalizedQuery: LyricsTrackQuery,
    metadataSignature: string,
    options: { forceRefresh?: boolean },
    trackOffsetMs: number,
    lrclibCached: library.LyricsCacheEntry | null
  ): Promise<LyricsLookupResult> {
    const { path, title, artist, durationSeconds } = normalizedQuery

    const xlrcdbLookup = await this.xlrcdb.lookup(normalizedQuery, metadataSignature, {
      forceRefresh: options.forceRefresh
    })
    if (xlrcdbLookup.status === 'hit') {
      this.setLastError(null)
      await this.libraryApi.upsertLyricsCache({
        trackPath: path,
        metadataSignature,
        status: 'hit',
        source: 'xlrcdb',
        provider: 'xlrcdb',
        plainLyrics: xlrcdbLookup.lyrics.plainLyrics,
        syncedLyrics: xlrcdbLookup.lyrics.syncedLyrics,
        syncedLines: xlrcdbLookup.lyrics.syncedLines
      })
      return {
        status: 'hit',
        lyrics: applyTrackOffsetToPayload(xlrcdbLookup.lyrics, trackOffsetMs),
        cached: false,
        availableSources: ['xlrcdb']
      }
    }

    if (lrclibCached) {
      if (lrclibCached.status === 'not_found' && xlrcdbLookup.status === 'not_found') {
        await this.cacheOnlineNotFound(path, metadataSignature)
      }
      const cachedResult = this.createLookupResultFromCache(lrclibCached, trackOffsetMs)
      if (cachedResult) {
        this.setLastError(null)
        return cachedResult
      }
    }

    const lrclibLookup = await this.lrclib.lookup(normalizedQuery, metadataSignature, {
      forceRefresh: options.forceRefresh
    })
    if (lrclibLookup.status === 'hit') {
      this.setLastError(null)
      await this.libraryApi.upsertLyricsCache({
        trackPath: path,
        metadataSignature,
        status: 'hit',
        source: 'lrclib',
        provider: 'lrclib',
        plainLyrics: lrclibLookup.lyrics.plainLyrics,
        syncedLyrics: lrclibLookup.lyrics.syncedLyrics,
        syncedLines: lrclibLookup.lyrics.syncedLines
      })
      return {
        status: 'hit',
        lyrics: applyTrackOffsetToPayload(lrclibLookup.lyrics, trackOffsetMs),
        cached: false,
        availableSources: ['lrclib']
      }
    }

    if (lrclibLookup.status === 'provider_unavailable') {
      this.setLastError(null)
      return {
        status: 'not_found',
        reason: 'provider-unavailable'
      }
    }

    if (lrclibLookup.status === 'transient_error') {
      this.setLastError(lrclibLookup.message)
      return {
        status: 'transient_error',
        message: lrclibLookup.message,
        code: lrclibLookup.code
      }
    }

    this.setLastError(null)
    
    // --- FALLBACK PROVIDERS (PRIORITIZING SYNCED LYRICS) ---
    const providers = [
      new BetterLyricsProvider(),
      new KuGouProvider(),
      new NetEaseProvider(),
      new GeniusProvider()
    ]
    
    const targetDurationMs = (durationSeconds ?? -1) * 1000
    const queryList = buildQueryVariants(title, artist)
    
    const validCandidates: Array<{
      providerName: string
      res: LyricsSearchResult
      payload: LyricsPayload
      isSynced: boolean
    }> = []

    for (const q of queryList) {
      const qQuery: LyricsTrackQuery = {
        ...normalizedQuery,
        title: q.title,
        artist: q.artist
      }

      for (const provider of providers) {
        try {
          const results = await provider.searchAll(qQuery)
          for (const res of results) {
            if (validateResult(res, title, artist, targetDurationMs, true)) {
              const payload = parseLyricsText(res.lyrics, 'online', 'lrc')
              if (payload) {
                const isSynced = res.isSynced || payload.syncedLines.length > 0
                validCandidates.push({
                  providerName: provider.name.toLowerCase(),
                  res,
                  payload,
                  isSynced
                })
                // Short circuit immediately on finding a verified synced result
                if (isSynced && provider.name !== 'Genius') {
                  break
                }
              }
            }
          }
          if (validCandidates.some((c) => c.isSynced)) {
            break
          }
        } catch {
          // Ignore provider errors and continue to the next one
        }
      }
      if (validCandidates.some((c) => c.isSynced)) {
        break
      }
    }

    if (validCandidates.length > 0) {
      // Sort candidates: synced lyrics first, preserving provider quality order
      validCandidates.sort((a, b) => {
        if (a.isSynced && !b.isSynced) return -1
        if (!a.isSynced && b.isSynced) return 1
        return 0
      })

      const best = validCandidates[0]
      await this.libraryApi.upsertLyricsCache({
        trackPath: path,
        metadataSignature,
        status: 'hit',
        source: 'online',
        provider: best.providerName as any,
        plainLyrics: best.payload.plainLyrics,
        syncedLyrics: best.payload.syncedLyrics,
        syncedLines: best.payload.syncedLines
      })
      return {
        status: 'hit',
        lyrics: applyTrackOffsetToPayload(best.payload, trackOffsetMs),
        cached: false,
        availableSources: ['online']
      }
    }
    // --- END FALLBACK PROVIDERS ---

    if (xlrcdbLookup.status === 'not_found') {
      await this.cacheOnlineNotFound(path, metadataSignature)
    }
    return {
      status: 'not_found',
      reason: 'provider-not-found'
    }
  }

  private createLookupResultFromCache(
    cached: library.LyricsCacheEntry,
    trackOffsetMs: number
  ): LyricsLookupResult | null {
    if (cached.status === 'hit') {
      const payload = createLyricsPayload(
        cached.source,
        cached.provider,
        cached.format,
        cached.plainLyrics,
        cached.syncedLyrics,
        cached.syncedLines
      )
      if (!payload) return null
      return {
        status: 'hit',
        lyrics: applyTrackOffsetToPayload(payload, trackOffsetMs),
        cached: true
      }
    }

    return {
      status: 'not_found',
      reason: cached.source === 'embedded' ? 'embedded-missing' : 'provider-not-found'
    }
  }

  private async cacheOnlineNotFound(trackPath: string, metadataSignature: string): Promise<void> {
    await this.libraryApi.upsertLyricsCache({
      trackPath,
      metadataSignature,
      status: 'not_found',
      source: 'xlrcdb',
      provider: 'xlrcdb',
      plainLyrics: null,
      syncedLyrics: null,
      syncedLines: []
    })
  }
}
