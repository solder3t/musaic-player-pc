import { ttmlToLrc } from './ttmlParser'
import type { LyricsTrackQuery } from '../../types/lyrics'
import * as https from 'https'

export interface LyricsSearchResult {
  provider: string
  lyrics: string
  isSynced: boolean
  trackTitle?: string | null
  artistName?: string | null
  durationMs?: number | null
}

export interface MusaicLyricsProvider {
  name: string
  searchAll(query: LyricsTrackQuery): Promise<LyricsSearchResult[]>
}

// ----------------------------------------------------------------------------
// Utilities
// ----------------------------------------------------------------------------

async function dohFetchBody(urlString: string): Promise<string | null> {
  try {
    const urlObj = new URL(urlString)
    const hostname = urlObj.hostname

    const dohUrl = `https://1.1.1.1/dns-query?name=${encodeURIComponent(hostname)}&type=A`
    
    const ip = await new Promise<string>((resolve, reject) => {
      const req = https.get(dohUrl, {
        headers: {
          'Accept': 'application/dns-json',
          'Host': 'cloudflare-dns.com'
        },
        servername: 'cloudflare-dns.com',
        timeout: 5000
      }, (res) => {
        let data = ''
        res.on('data', chunk => data += chunk)
        res.on('end', () => {
          try {
            const json = JSON.parse(data)
            const answer = json.Answer?.find((a: any) => a.type === 1)
            if (answer && answer.data) resolve(answer.data)
            else reject(new Error('No A record'))
          } catch (e) {
            reject(e)
          }
        })
      })
      req.on('error', reject)
      req.on('timeout', () => { req.destroy(); reject(new Error('timeout')) })
    })

    return await new Promise<string>((resolve, reject) => {
      const req = https.get({
        hostname: ip,
        port: urlObj.port ? parseInt(urlObj.port) : 443,
        path: urlObj.pathname + urlObj.search,
        headers: {
          'Host': hostname,
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        },
        servername: hostname,
        timeout: 5000
      }, (res) => {
        if (res.statusCode !== 200) {
          reject(new Error(`Status ${res.statusCode}`))
          return
        }
        let data = ''
        res.on('data', chunk => data += chunk)
        res.on('end', () => resolve(data))
      })
      req.on('error', reject)
      req.on('timeout', () => { req.destroy(); reject(new Error('timeout')) })
    })
  } catch (err) {
    console.warn(`[DoH] Failed to fetch ${urlString} via DoH:`, err)
    return null
  }
}

async function fetchBody(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      signal: AbortSignal.timeout(5000)
    })
    if (!res.ok) return null
    return await res.text()
  } catch (err) {
    console.warn(`[fetchBody] Standard fetch failed for ${url}, falling back to DoH:`, err)
    return await dohFetchBody(url)
  }
}

async function fetchJson(url: string): Promise<any> {
  const body = await fetchBody(url)
  if (!body) return null
  try {
    return JSON.parse(body)
  } catch {
    return null
  }
}

// ----------------------------------------------------------------------------
// Providers
// ----------------------------------------------------------------------------

export class KuGouProvider implements MusaicLyricsProvider {
  name = 'KuGou'

  async searchAll(query: LyricsTrackQuery): Promise<LyricsSearchResult[]> {
    const keyword = [query.artist, query.title].filter(Boolean).join(' - ')
    if (!keyword.trim()) return []

    let searchUrl = `https://lyrics.kugou.com/search?ver=1&man=yes&client=pc&keyword=${encodeURIComponent(keyword)}`
    if (query.durationSeconds && query.durationSeconds > 0) {
      searchUrl += `&duration=${query.durationSeconds * 1000}`
    }

    const root = await fetchJson(searchUrl)
    if (!root || !Array.isArray(root.candidates)) return []

    const results: LyricsSearchResult[] = []
    for (const candidate of root.candidates.slice(0, 8)) {
      if (!candidate.id || !candidate.accesskey) continue

      const downloadUrl = `https://lyrics.kugou.com/download?ver=1&client=pc&id=${encodeURIComponent(candidate.id)}&accesskey=${encodeURIComponent(candidate.accesskey)}&fmt=lrc&charset=utf8`
      const lyricRoot = await fetchJson(downloadUrl)
      if (!lyricRoot) continue

      const content = lyricRoot.content || lyricRoot.lyrics
      if (!content) continue

      try {
        const decoded = Buffer.from(content, 'base64').toString('utf8').trim()
        if (!decoded) continue

        results.push({
          provider: this.name,
          lyrics: decoded,
          isSynced: /\[\d{1,2}:\d{2}/.test(decoded),
          trackTitle: candidate.songName,
          artistName: candidate.singerName,
          durationMs: candidate.duration ? parseInt(candidate.duration, 10) : null
        })
      } catch {
        continue
      }
    }
    return results
  }
}

export class NetEaseProvider implements MusaicLyricsProvider {
  name = 'NetEase'

  async searchAll(query: LyricsTrackQuery): Promise<LyricsSearchResult[]> {
    const keyword = [query.artist, query.title].filter(Boolean).join(' ')
    if (!keyword.trim()) return []

    const searchUrl = `https://music.163.com/api/search/get?s=${encodeURIComponent(keyword)}&type=1&offset=0&limit=8`
    const root = await fetchJson(searchUrl)
    if (!root || !root.result || !Array.isArray(root.result.songs)) return []

    const results: LyricsSearchResult[] = []
    for (const song of root.result.songs.slice(0, 8)) {
      if (!song.id) continue

      const lyricUrl = `https://music.163.com/api/song/lyric?os=pc&id=${song.id}&lv=-1&kv=-1&tv=-1`
      const lyricRoot = await fetchJson(lyricUrl)
      if (!lyricRoot || !lyricRoot.lrc || !lyricRoot.lrc.lyric) continue

      const lrc = lyricRoot.lrc.lyric.trim()
      if (!lrc) continue

      const artistName = song.artists && song.artists.length > 0 ? song.artists[0].name : null

      results.push({
        provider: this.name,
        lyrics: lrc,
        isSynced: /\[\d{1,2}:\d{2}/.test(lrc),
        trackTitle: song.name,
        artistName,
        durationMs: song.duration ? parseInt(song.duration, 10) : null
      })
    }
    return results
  }
}

export class BetterLyricsProvider implements MusaicLyricsProvider {
  name = 'BetterLyrics'

  async searchAll(query: LyricsTrackQuery): Promise<LyricsSearchResult[]> {
    let url = `https://lyrics-api.boidu.dev/getLyrics?s=${encodeURIComponent(query.title)}&a=${encodeURIComponent(query.artist)}`
    if (query.durationSeconds && query.durationSeconds > 0) {
      url += `&d=${query.durationSeconds}`
    }

    const root = await fetchJson(url)
    if (!root || !root.ttml) return []

    const lrc = ttmlToLrc(root.ttml)
    if (!lrc.trim()) return []

    return [{
      provider: this.name,
      lyrics: lrc,
      isSynced: /\[\d{1,2}:\d{2}/.test(lrc),
      trackTitle: query.title,
      artistName: query.artist,
      durationMs: query.durationSeconds ? query.durationSeconds * 1000 : null
    }]
  }
}

export class GeniusProvider implements MusaicLyricsProvider {
  name = 'Genius'

  async searchAll(query: LyricsTrackQuery): Promise<LyricsSearchResult[]> {
    const keyword = [query.artist, query.title].filter(Boolean).join(' ')
    if (!keyword.trim()) return []

    const root = await fetchJson(`https://genius.com/api/search/multi?per_page=5&q=${encodeURIComponent(keyword)}`)
    if (!root || !root.response || !Array.isArray(root.response.sections)) return []

    const songUrls: string[] = []
    for (const section of root.response.sections) {
      if (!Array.isArray(section.hits)) continue
      for (const hit of section.hits) {
        if (!hit.result) continue
        if (hit.result._type === 'song' || (hit.result.api_path && hit.result.api_path.startsWith('/songs/'))) {
          if (hit.result.url) {
            songUrls.push(hit.result.url)
          }
        }
      }
    }

    const uniqueUrls = Array.from(new Set(songUrls)).slice(0, 5)
    const results: LyricsSearchResult[] = []

    for (const url of uniqueUrls) {
      const html = await fetchBody(url)
      if (!html) continue

      const lyrics = this.extractLyricsFromHtml(html)
      if (lyrics) {
        results.push({
          provider: this.name,
          lyrics,
          isSynced: false
        })
      }
    }

    return results
  }

  private extractLyricsFromHtml(html: string): string | null {
    const containerRegex = /(?:data-lyrics-container='true'|class="Lyrics__Container-sc-[^"]+")[^>]*>([\s\S]*?)<\/div>/gi
    const chunks: string[] = []
    let match

    while ((match = containerRegex.exec(html)) !== null) {
      chunks.push(match[1])
    }

    if (chunks.length === 0) return null

    let raw = chunks.join('\n')
    // Replace <br> with newlines
    raw = raw.replace(/<br\s*\/?>/gi, '\n')
    // Strip HTML tags
    raw = raw.replace(/<[^>]+>/g, '')
    // Decode basic HTML entities
    raw = raw
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
    // Fix multiple newlines
    raw = raw.replace(/\n{3,}/g, '\n\n').trim()

    return raw || null
  }
}
