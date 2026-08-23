import { create } from 'zustand'
import type {
  LyricsLookupResult,
  LyricsPayload,
  LyricsStatus,
  LyricsTrackQuery,
  OnlineLyricsCandidate
} from '../../types/lyrics'
import { useAiSettingsStore } from './aiSettingsStore'

interface LyricsStore {
  status: LyricsStatus | null
  resultByTrackPath: Record<string, LyricsLookupResult>
  currentTrackPath: string | null
  currentResult: LyricsLookupResult | null
  isLoading: boolean
  isInitialized: boolean
  errorMessage: string
  init: () => Promise<void>
  refresh: () => Promise<void>
  setEnabled: (enabled: boolean) => Promise<LyricsStatus | null>
  setLrclibBaseUrl: (baseUrl: string) => Promise<LyricsStatus | null>
  loadForTrack: (query: LyricsTrackQuery | null) => Promise<LyricsLookupResult | null>
  refreshForTrack: (query: LyricsTrackQuery | null) => Promise<LyricsLookupResult | null>
  selectLyricsSource: (source: 'embedded' | 'online') => void
  fetchOnlineLyricsForTrack: (query: LyricsTrackQuery | null) => Promise<LyricsLookupResult | null>
  resetToDefaults: () => Promise<LyricsStatus | null>
  isRomanized: boolean
  isTranslated: boolean
  aiProcessing: boolean
  toggleRomanized: () => Promise<void>
  toggleTranslated: () => Promise<void>
  // Search Modal state
  searchModalOpen: boolean
  searchCandidates: OnlineLyricsCandidate[]
  isSearchingCandidates: boolean
  searchQuery: LyricsTrackQuery | null
  searchError: string
  openSearchModal: (query?: LyricsTrackQuery | null) => Promise<void>
  closeSearchModal: () => void
  performSearch: (title: string, artist: string) => Promise<void>
  applyCandidate: (candidate: OnlineLyricsCandidate) => Promise<boolean>
}

let statusUnsubscribe: (() => void) | null = null
let activeRequestId = 0

export const LYRICS_RESULT_CACHE_LIMIT = 64

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message
  return 'Failed to update lyrics settings.'
}

function normalizeTrackPath(path: string | undefined): string | null {
  if (!path) return null
  const normalized = path.trim()
  return normalized.length > 0 ? normalized : null
}

export function putLyricsResultInCache(
  cache: Record<string, LyricsLookupResult>,
  trackPath: string,
  result: LyricsLookupResult,
  currentTrackPath: string | null,
  limit = LYRICS_RESULT_CACHE_LIMIT
): Record<string, LyricsLookupResult> {
  const maxEntries = Math.max(1, Math.floor(limit))
  const entries = Object.entries(cache).filter(([path]) => path !== trackPath)
  entries.push([trackPath, result])

  if (entries.length <= maxEntries) {
    return Object.fromEntries(entries)
  }

  const bounded = new Map(entries)
  while (bounded.size > maxEntries) {
    const oldestPath = bounded.keys().next().value as string | undefined
    if (oldestPath === undefined) break

    if (oldestPath === currentTrackPath) {
      const currentResult = bounded.get(oldestPath)
      if (currentResult === undefined) break
      bounded.delete(oldestPath)
      bounded.set(oldestPath, currentResult)
      continue
    }

    bounded.delete(oldestPath)
  }

  return Object.fromEntries(bounded)
}

function touchLyricsResultCacheEntry(
  cache: Record<string, LyricsLookupResult>,
  trackPath: string,
  currentTrackPath: string | null
): Record<string, LyricsLookupResult> {
  const result = cache[trackPath]
  if (result === undefined) return cache
  return putLyricsResultInCache(cache, trackPath, result, currentTrackPath)
}

function isProviderUnavailableResult(result: LyricsLookupResult): boolean {
  return result.status === 'not_found' && result.reason === 'provider-unavailable'
}

const aiLyricsCache = new Map<string, {
  romanized?: LyricsPayload
  translated?: Record<string, LyricsPayload>
}>()

export const useLyricsStore = create<LyricsStore>((set, get) => {
  const applyStatus = (status: LyricsStatus): LyricsStatus => {
    set({
      status,
      errorMessage: ''
    })
    return status
  }

  const ensureSubscription = (): void => {
    if (statusUnsubscribe) return
    statusUnsubscribe = window.electronAPI.lyrics.onStatus((status) => {
      applyStatus(status)
    })
  }

  const fetchStatus = async (): Promise<LyricsStatus> => {
    const status = await window.electronAPI.lyrics.getStatus()
    ensureSubscription()
    return applyStatus(status)
  }

  const applyTrackResult = (
    requestId: number,
    trackPath: string,
    result: LyricsLookupResult
  ): LyricsLookupResult => {
    if (requestId !== activeRequestId) return result
    set((state) => ({
      resultByTrackPath: isProviderUnavailableResult(result) && state.resultByTrackPath[trackPath]?.status === 'hit'
        ? touchLyricsResultCacheEntry(state.resultByTrackPath, trackPath, trackPath)
        : putLyricsResultInCache(state.resultByTrackPath, trackPath, result, trackPath),
      currentTrackPath: trackPath,
      currentResult: isProviderUnavailableResult(result) && state.resultByTrackPath[trackPath]?.status === 'hit'
        ? state.resultByTrackPath[trackPath]
        : result,
      isLoading: false,
      isRomanized: false,
      isTranslated: false,
      aiProcessing: false,
      errorMessage: result.status === 'transient_error' ? result.message : ''
    }))

    const { settings } = useAiSettingsStore.getState()
    if (settings.autoRomanize && result.status === 'hit') {
      setTimeout(() => {
        const state = get()
        if (state.currentTrackPath === trackPath && !state.isRomanized) {
          void state.toggleRomanized()
        }
      }, 100)
    }

    return result
  }

  return {
    status: null,
    resultByTrackPath: {},
    currentTrackPath: null,
    currentResult: null,
    isLoading: false,
    isInitialized: false,
    errorMessage: '',
    isRomanized: false,
    isTranslated: false,
    aiProcessing: false,
    searchModalOpen: false,
    searchCandidates: [],
    isSearchingCandidates: false,
    searchQuery: null,
    searchError: '',

    init: async () => {
      if (get().isInitialized) return
      set({ isInitialized: true })
      try {
        await fetchStatus()
      } catch (error) {
        set({ errorMessage: toErrorMessage(error) })
      }
    },

    refresh: async () => {
      try {
        await fetchStatus()
      } catch (error) {
        set({ errorMessage: toErrorMessage(error) })
      }
    },

    setEnabled: async (enabled: boolean) => {
      try {
        const status = await window.electronAPI.lyrics.setEnabled(enabled)
        return applyStatus(status)
      } catch (error) {
        set({ errorMessage: toErrorMessage(error) })
        return null
      }
    },

    setLrclibBaseUrl: async (baseUrl: string) => {
      try {
        const status = await window.electronAPI.lyrics.setLrclibBaseUrl(baseUrl)
        return applyStatus(status)
      } catch (error) {
        set({ errorMessage: toErrorMessage(error) })
        return null
      }
    },

    loadForTrack: async (query: LyricsTrackQuery | null) => {
      const trackPath = normalizeTrackPath(query?.path)
      if (!trackPath || !query) {
        activeRequestId += 1
        set({
          currentTrackPath: null,
          currentResult: null,
          isLoading: false,
          isRomanized: false,
          isTranslated: false,
          aiProcessing: false,
          errorMessage: ''
        })
        return null
      }

      const requestId = activeRequestId + 1
      activeRequestId = requestId
      set((state) => ({
        resultByTrackPath: touchLyricsResultCacheEntry(state.resultByTrackPath, trackPath, trackPath),
        currentTrackPath: trackPath,
        currentResult: state.resultByTrackPath[trackPath] ?? null,
        isLoading: true,
        isRomanized: false,
        isTranslated: false,
        aiProcessing: false,
        errorMessage: ''
      }))

      try {
        const result = await window.electronAPI.lyrics.getForTrack(query)
        return applyTrackResult(requestId, trackPath, result)
      } catch (error) {
        if (requestId !== activeRequestId) return null
        set({
          isLoading: false,
          errorMessage: toErrorMessage(error)
        })
        return null
      }
    },

    refreshForTrack: async (query: LyricsTrackQuery | null) => {
      const trackPath = normalizeTrackPath(query?.path)
      if (!trackPath || !query) {
        activeRequestId += 1
        set({
          currentTrackPath: null,
          currentResult: null,
          isLoading: false,
          isRomanized: false,
          isTranslated: false,
          aiProcessing: false,
          errorMessage: ''
        })
        return null
      }

      const requestId = activeRequestId + 1
      activeRequestId = requestId
      set((state) => ({
        currentTrackPath: trackPath,
        currentResult: state.resultByTrackPath[trackPath] ?? null,
        isLoading: true,
        isRomanized: false,
        isTranslated: false,
        aiProcessing: false,
        errorMessage: ''
      }))

      try {
        const result = await window.electronAPI.lyrics.refreshForTrack(query)
        return applyTrackResult(requestId, trackPath, result)
      } catch (error) {
        if (requestId !== activeRequestId) return null
        set({
          isLoading: false,
          errorMessage: toErrorMessage(error)
        })
        return null
      }
    },

    selectLyricsSource: (targetSource: 'embedded' | 'online') => {
      const state = get()
      const currentResult = state.currentResult
      const currentTrackPath = state.currentTrackPath
      if (!currentResult || currentResult.status !== 'hit' || !currentTrackPath) return

      const currentLyrics = currentResult.lyrics
      if (targetSource === 'embedded' && currentLyrics.source !== 'embedded' && currentResult.embeddedAlternative) {
        const nextResult: LyricsLookupResult = {
          ...currentResult,
          lyrics: currentResult.embeddedAlternative,
          onlineAlternative: currentLyrics
        }
        set((s) => ({
          resultByTrackPath: { ...s.resultByTrackPath, [s.currentTrackPath!]: nextResult },
          currentResult: nextResult,
          isRomanized: false,
          isTranslated: false
        }))
        void window.electronAPI.lyrics.selectSource(currentTrackPath, 'embedded').catch(() => {})
      } else if (targetSource === 'online' && currentLyrics.source === 'embedded' && currentResult.onlineAlternative) {
        const nextResult: LyricsLookupResult = {
          ...currentResult,
          lyrics: currentResult.onlineAlternative,
          embeddedAlternative: currentLyrics
        }
        set((s) => ({
          resultByTrackPath: { ...s.resultByTrackPath, [s.currentTrackPath!]: nextResult },
          currentResult: nextResult,
          isRomanized: false,
          isTranslated: false
        }))
        void window.electronAPI.lyrics.selectSource(currentTrackPath, 'online').catch(() => {})
      }
    },

    fetchOnlineLyricsForTrack: async (query: LyricsTrackQuery | null) => {
      const trackPath = normalizeTrackPath(query?.path)
      if (!trackPath || !query) return null

      const existingHit = get().resultByTrackPath[trackPath]
      const currentEmbeddedPayload = existingHit?.status === 'hit' && existingHit.lyrics.source === 'embedded'
        ? existingHit.lyrics
        : existingHit?.status === 'hit' && existingHit.embeddedAlternative
          ? existingHit.embeddedAlternative
          : null

      set({
        isLoading: true,
        isRomanized: false,
        isTranslated: false,
        aiProcessing: false,
        errorMessage: ''
      })
      try {
        const result = await window.electronAPI.lyrics.getForTrack(
          {
            ...query,
            preferSource: 'online'
          },
          {
            forceRefresh: true,
            preferSource: 'online'
          }
        )

        if (result.status === 'hit') {
          const nextResult: LyricsLookupResult = {
            ...result,
            availableSources: currentEmbeddedPayload ? ['online', 'embedded'] : (result.availableSources || ['online']),
            embeddedAlternative: currentEmbeddedPayload ?? result.embeddedAlternative ?? null
          }
          set((s) => ({
            resultByTrackPath: putLyricsResultInCache(s.resultByTrackPath, trackPath, nextResult, trackPath),
            currentResult: nextResult,
            isLoading: false,
            isRomanized: false,
            isTranslated: false
          }))
          return nextResult
        } else {
          set({
            isLoading: false,
            errorMessage: 'No online synced lyrics found for this track.'
          })
          return result
        }
      } catch (error) {
        set({
          isLoading: false,
          errorMessage: toErrorMessage(error)
        })
        return null
      }
    },

    resetToDefaults: async () => {
      try {
        const status = await window.electronAPI.lyrics.resetToDefaults()
        applyStatus(status)
        set({
          resultByTrackPath: {},
          currentTrackPath: null,
          currentResult: null,
          isLoading: false,
          isRomanized: false,
          isTranslated: false,
          aiProcessing: false,
          errorMessage: ''
        })
        return status
      } catch (error) {
        set({ errorMessage: toErrorMessage(error) })
        return null
      }
    },

    toggleRomanized: async () => {
      const state = get()
      const currentTrackPath = state.currentTrackPath
      if (state.aiProcessing || !currentTrackPath) return
      if (state.isRomanized) {
        set({
          isRomanized: false,
          currentResult: state.resultByTrackPath[currentTrackPath] ?? null
        })
        return
      }

      const activeResult = (state.currentResult && state.currentResult.status === 'hit' && state.currentResult.lyrics)
        ? state.currentResult
        : state.resultByTrackPath[currentTrackPath]
      if (!activeResult || activeResult.status !== 'hit' || !activeResult.lyrics) return

      const cachedRomanized = aiLyricsCache.get(currentTrackPath)?.romanized
      if (cachedRomanized) {
        set(() => ({
          isRomanized: true,
          isTranslated: false,
          aiProcessing: false,
          currentResult: {
            ...activeResult,
            lyrics: cachedRomanized
          }
        }))
        return
      }

      const { syncedLines, syncedLyrics, plainLyrics, format } = activeResult.lyrics
      const textToConvert = syncedLyrics ?? plainLyrics
      if (!textToConvert && (!syncedLines || syncedLines.length === 0)) return

      const inputPayload = (syncedLines && syncedLines.length > 0)
        ? { text: textToConvert ?? '', syncedLines, format }
        : (textToConvert ?? '')

      set({ aiProcessing: true, errorMessage: '' })
      try {
        const { settings } = useAiSettingsStore.getState()
        const aiResult = await window.electronAPI.ai.romanizeLyrics(inputPayload, settings)
        
        if (aiResult.error) {
          set({
            aiProcessing: false,
            isRomanized: false,
            errorMessage: aiResult.error
          })
          return
        }

        if (!aiResult.payload) {
          set({
            aiProcessing: false,
            isRomanized: false,
            errorMessage: 'AI romanization produced no output.'
          })
          return
        }

        const existing = aiLyricsCache.get(currentTrackPath) || {}
        existing.romanized = aiResult.payload
        aiLyricsCache.set(currentTrackPath, existing)

        set(() => ({
          isRomanized: true,
          isTranslated: false,
          aiProcessing: false,
          errorMessage: '',
          currentResult: {
            ...activeResult,
            lyrics: aiResult.payload
          }
        }))
      } catch (err) {
        console.error('Romanization failed', err)
        const msg = err instanceof Error ? err.message : String(err)
        set({
          aiProcessing: false,
          isRomanized: false,
          errorMessage: msg
        })
      }
    },

    toggleTranslated: async () => {
      const state = get()
      const currentTrackPath = state.currentTrackPath
      if (state.aiProcessing || !currentTrackPath) return
      if (state.isTranslated) {
        set({
          isTranslated: false,
          currentResult: state.resultByTrackPath[currentTrackPath] ?? null
        })
        return
      }

      const activeResult = (state.currentResult && state.currentResult.status === 'hit' && state.currentResult.lyrics)
        ? state.currentResult
        : state.resultByTrackPath[currentTrackPath]
      if (!activeResult || activeResult.status !== 'hit' || !activeResult.lyrics) return

      const { settings } = useAiSettingsStore.getState()
      const targetLanguage = settings.targetLanguage || 'English'

      const cachedTranslated = aiLyricsCache.get(currentTrackPath)?.translated?.[targetLanguage]
      if (cachedTranslated) {
        set(() => ({
          isTranslated: true,
          isRomanized: false,
          aiProcessing: false,
          currentResult: {
            ...activeResult,
            lyrics: cachedTranslated
          }
        }))
        return
      }

      const { syncedLines, syncedLyrics, plainLyrics, format } = activeResult.lyrics
      const textToConvert = syncedLyrics ?? plainLyrics
      if (!textToConvert && (!syncedLines || syncedLines.length === 0)) return

      const inputPayload = (syncedLines && syncedLines.length > 0)
        ? { text: textToConvert ?? '', syncedLines, format }
        : (textToConvert ?? '')

      set({ aiProcessing: true, errorMessage: '' })
      try {
        const aiResult = await window.electronAPI.ai.translateLyrics(inputPayload, settings, targetLanguage)
        
        if (aiResult.error) {
          set({
            aiProcessing: false,
            isTranslated: false,
            errorMessage: aiResult.error
          })
          return
        }

        if (!aiResult.payload) {
          set({
            aiProcessing: false,
            isTranslated: false,
            errorMessage: 'AI translation produced no output.'
          })
          return
        }

        const existing = aiLyricsCache.get(currentTrackPath) || {}
        if (!existing.translated) existing.translated = {}
        existing.translated[targetLanguage] = aiResult.payload
        aiLyricsCache.set(currentTrackPath, existing)

        set(() => ({
          isTranslated: true,
          isRomanized: false,
          aiProcessing: false,
          errorMessage: '',
          currentResult: {
            ...activeResult,
            lyrics: aiResult.payload
          }
        }))
      } catch (err) {
        console.error('Translation failed', err)
        const msg = err instanceof Error ? err.message : String(err)
        set({
          aiProcessing: false,
          isTranslated: false,
          errorMessage: msg
        })
      }
    },

    openSearchModal: async (query) => {
      const state = get()
      const targetQuery = query ?? (state.currentTrackPath ? { path: state.currentTrackPath, title: '', artist: '' } : null)
      if (!targetQuery) return

      set({
        searchModalOpen: true,
        searchQuery: targetQuery,
        searchCandidates: [],
        isSearchingCandidates: true,
        searchError: ''
      })

      try {
        const candidates = await window.electronAPI.lyrics.searchAllProviders(targetQuery)
        set({
          searchCandidates: candidates,
          isSearchingCandidates: false,
          searchError: candidates.length === 0 ? 'No lyrics candidates found across providers.' : ''
        })
      } catch (err) {
        set({
          isSearchingCandidates: false,
          searchError: err instanceof Error ? err.message : 'Failed to search lyrics providers.'
        })
      }
    },

    closeSearchModal: () => {
      set({ searchModalOpen: false, searchCandidates: [], isSearchingCandidates: false, searchError: '' })
    },

    performSearch: async (title: string, artist: string) => {
      const state = get()
      const currentQuery = state.searchQuery
      const newQuery: LyricsTrackQuery = {
        path: currentQuery?.path || state.currentTrackPath || '',
        title: title.trim(),
        artist: artist.trim(),
        durationSeconds: currentQuery?.durationSeconds
      }

      set({
        searchQuery: newQuery,
        isSearchingCandidates: true,
        searchError: ''
      })

      try {
        const candidates = await window.electronAPI.lyrics.searchAllProviders(newQuery)
        set({
          searchCandidates: candidates,
          isSearchingCandidates: false,
          searchError: candidates.length === 0 ? 'No lyrics candidates found for this search query.' : ''
        })
      } catch (err) {
        set({
          isSearchingCandidates: false,
          searchError: err instanceof Error ? err.message : 'Failed to search lyrics providers.'
        })
      }
    },

    applyCandidate: async (candidate: OnlineLyricsCandidate) => {
      const state = get()
      const trackPath = state.searchQuery?.path || state.currentTrackPath
      if (!trackPath) return false

      try {
        const result = await window.electronAPI.lyrics.applyCandidate(trackPath, candidate)
        if (result.status === 'hit') {
          set((s) => ({
            resultByTrackPath: putLyricsResultInCache(s.resultByTrackPath, trackPath, result, s.currentTrackPath),
            currentResult: s.currentTrackPath === trackPath ? result : s.currentResult,
            isRomanized: false,
            isTranslated: false,
            searchModalOpen: false,
            searchCandidates: [],
            searchError: ''
          }))
          return true
        }
        return false
      } catch (err) {
        set({ searchError: err instanceof Error ? err.message : 'Failed to apply selected lyrics.' })
        return false
      }
    }
  }
})
