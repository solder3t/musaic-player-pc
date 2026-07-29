import { sendAiPrompt, AiRequestOptions } from './aiClient'

export interface AiMetadataResponse {
  title?: string
  artist?: string
  album?: string
  genre?: string
  year?: number
  bpm?: number
  language?: string
  trackNumber?: number
  discNumber?: number
}

const SYSTEM_PROMPT = `You are a professional music database and cataloging expert.
Your task is to identify, clean up, and complete track metadata for a given song title and artist.
Research your database and memory to find the official, accurate metadata details.

Target JSON Output Schema:
{
  "title": string (the official, clean song title, removing any artist name prefix, video formatting like "Official Video", "MV", "HD", or bracketed/parenthetical video suffixes),
  "artist": string (the official, clean artist name, separating multiple artists if needed or providing the primary artist),
  "album": string or null (the official album or EP name the track belongs to, removing suffixes like " - EP", " - Single", " EP", " Single", or deluxe brackets like "(Deluxe Edition)" to keep the album name clean),
  "genre": string or null (primary genre, e.g., "Rock", "Pop", "Jazz"),
  "year": integer or null (original release year),
  "bpm": integer or null (beats per minute, estimate if needed),
  "language": string or null (lyrics language name in English, e.g., "English", "Spanish", "Japanese". If the song has vocals, identify the language of the lyrics. Do not return null for vocal tracks; return null only if the song is purely instrumental.),
  "trackNumber": integer or null (position on the album/EP),
  "discNumber": integer or null (typically 1 unless multi-disc release)
}

Rules:
1. Return ONLY the valid JSON object. Do not include any other fields, conversational text, or markdown code blocks.
2. For fields like genre, year, album, and bpm, if the exact official value is not confidently known, make a reasonable estimate/guess based on the artist's general musical style, discography, active era, or similar tracks instead of returning null. Only return null if there is absolutely no context or information to make a reasonable guess.
3. Be as accurate as possible, prioritizing official discography details when available, but providing smart estimates as fallbacks.
4. For the "language" field, always specify the language of the vocals/lyrics (e.g., "English") if vocals are present. Only return null if the track is strictly instrumental with no vocals.`

function cleanSearchTerm(term: string): string {
  const titleArtifactRegex = /(\s*[\(\[][^\]\)]*(official|video|audio|lyric|myfree|hd)[^\]\)]*[\)\]]|\.mp3|\.wav|\.flac|\s*-\s*(official|video|audio|lyric).*)/i
  return term.replace(titleArtifactRegex, '').trim()
}

async function fetchItunesReference(title: string, artist: string): Promise<string | null> {
  try {
    const cleanTitle = cleanSearchTerm(title)
    const cleanArtist = cleanSearchTerm(artist)
    const query = `${cleanArtist} ${cleanTitle}`.trim()
    if (!query) return null

    const url = `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&media=music&limit=5`
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'MusaicPlayer/1.0'
      }
    })

    if (!response.ok) return null

    const data = await response.json()
    if (data.results && data.results.length > 0) {
      let bestResult = data.results[0]
      let bestScore = -1

      for (const result of data.results) {
        const rArtist = result.artistName || ''
        const rTitle = result.trackName || ''

        let score = 0
        // Score artist match
        if (rArtist.toLowerCase() === cleanArtist.toLowerCase()) {
          score += 10
        } else if (rArtist.toLowerCase().includes(cleanArtist.toLowerCase()) || cleanArtist.toLowerCase().includes(rArtist.toLowerCase())) {
          score += 5
        }

        // Score title match
        if (rTitle.toLowerCase() === cleanTitle.toLowerCase()) {
          score += 10
        } else if (rTitle.toLowerCase().includes(cleanTitle.toLowerCase()) || cleanTitle.toLowerCase().includes(rTitle.toLowerCase())) {
          score += 5
        }

        // Penalize feat/remix if not in query artist
        const rArtistLower = rArtist.toLowerCase()
        const rTitleLower = rTitle.toLowerCase()
        const cleanArtistLower = cleanArtist.toLowerCase()
        const cleanTitleLower = cleanTitle.toLowerCase()

        if (rArtistLower.includes('feat') || rArtistLower.includes('remix') || rTitleLower.includes('feat') || rTitleLower.includes('remix')) {
          if (!cleanArtistLower.includes('feat') && !cleanArtistLower.includes('remix') && !cleanTitleLower.includes('feat') && !cleanTitleLower.includes('remix')) {
            score -= 3
          }
        }

        if (score > bestScore) {
          bestScore = score
          bestResult = result
        }
      }

      const year = bestResult.releaseDate ? parseInt(bestResult.releaseDate.substring(0, 4), 10) : null

      const lines = [
        'Reference metadata found online:',
        bestResult.trackName ? `- Title: ${bestResult.trackName}` : null,
        bestResult.artistName ? `- Artist: ${bestResult.artistName}` : null,
        bestResult.collectionName ? `- Album: ${bestResult.collectionName}` : null,
        bestResult.primaryGenreName ? `- Genre: ${bestResult.primaryGenreName}` : null,
        year ? `- Year: ${year}` : null,
        bestResult.trackNumber ? `- Track Number: ${bestResult.trackNumber}` : null,
        bestResult.discNumber ? `- Disc Number: ${bestResult.discNumber}` : null
      ].filter(Boolean)

      return lines.join('\n')
    }

    return null
  } catch (error) {
    console.warn('[AiMetadataCompleter] iTunes reference lookup failed', error)
    return null
  }
}

export async function completeMetadata(
  title: string,
  artist: string,
  options: AiRequestOptions
): Promise<{ result: AiMetadataResponse | null; tokens: number }> {
  if (options.provider === 'none') {
    return { result: null, tokens: 0 }
  }

  try {
    let userPrompt = `Song: ${title} by ${artist}\n`
    const itunesRef = await fetchItunesReference(title, artist)
    if (itunesRef) {
      userPrompt += `\n${itunesRef}`
    }

    const response = await sendAiPrompt(SYSTEM_PROMPT, userPrompt, options)
    const content = response.text || ''

    console.log('[AiMetadataCompleter] Raw AI response:', content)
    
    const jsonStart = content.indexOf('{')
    const jsonEnd = content.lastIndexOf('}') + 1
    if (jsonStart === -1 || jsonEnd === 0) {
      return { result: null, tokens: response.tokens || 0 }
    }

    const jsonStr = content.substring(jsonStart, jsonEnd)
    const result = JSON.parse(jsonStr) as AiMetadataResponse
    return { result, tokens: response.tokens || 0 }
  } catch (error) {
    console.error('[AiMetadataCompleter] Error completing metadata', error)
    return { result: null, tokens: 0 }
  }
}
