import type { LyricsSearchResult } from './lyricsProviders'

function editDistance(s1: string, s2: string): number {
  const costs = new Int32Array(s2.length + 1)
  for (let i = 0; i <= s1.length; i++) {
    let lastValue = i
    for (let j = 0; j <= s2.length; j++) {
      if (i === 0) {
        costs[j] = j
      } else {
        if (j > 0) {
          let newValue = costs[j - 1]
          if (s1[i - 1] !== s2[j - 1]) {
            newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1
          }
          costs[j - 1] = lastValue
          lastValue = newValue
        }
      }
    }
    if (i > 0) costs[s2.length] = lastValue
  }
  return costs[s2.length]
}

export function calculateSimilarity(s1: string, s2: string): number {
  const longer = s1.length > s2.length ? s1 : s2
  const shorter = s1.length > s2.length ? s2 : s1
  if (longer.length === 0) return 1.0
  return (longer.length - editDistance(longer, shorter)) / longer.length
}

export function validateResult(
  result: LyricsSearchResult,
  targetTitle: string,
  targetArtist: string,
  targetDurationMs: number,
  isAutoMatch: boolean = true
): boolean {
  // 1. Duration check
  const resDuration = result.durationMs
  if (resDuration != null && targetDurationMs > 0) {
    // Auto-match is very strict (±5s), Manual/Selection is slightly more relaxed (±10s)
    const tolerance = isAutoMatch ? 5000 : 10000
    if (Math.abs(resDuration - targetDurationMs) > tolerance) return false
  } else if (isAutoMatch && targetDurationMs > 0) {
    // In auto-match mode, if the provider didn't return a duration we can't verify
    // correctness, so reject unless both title AND artist match closely.
    const resTitle = result.trackTitle || ''
    const resArtist = result.artistName || ''
    const titleOk = resTitle.trim() === '' || calculateSimilarity(resTitle.toLowerCase(), targetTitle.toLowerCase()) >= 0.6
    const artistOk = resArtist.trim() === '' || calculateSimilarity(resArtist.toLowerCase(), targetArtist.toLowerCase()) >= 0.4
    if (!titleOk || !artistOk) return false
  }

  // 2. Title Similarity Check
  const resTitle = result.trackTitle || ''
  if (isAutoMatch && resTitle.trim() !== '' && targetTitle.trim() !== '') {
    const titleSim = calculateSimilarity(resTitle.toLowerCase(), targetTitle.toLowerCase())
    if (titleSim < 0.5) return false
  }

  // 3. Artist Similarity Check
  const resArtist = result.artistName || ''
  if (isAutoMatch && resArtist.trim() !== '' && targetArtist.trim() !== '') {
    const artistSim = calculateSimilarity(resArtist.toLowerCase(), targetArtist.toLowerCase())
    if (artistSim < 0.4) return false
  }

  // 4. Tag check (Live/Remix/Acoustic/Instrumental)
  const tags = ['live', 'remix', 'acoustic', 'instrumental', 'demo', 'edit', 'version', 'mix']
  for (const tag of tags) {
    const targetHas = targetTitle.toLowerCase().includes(tag) || targetArtist.toLowerCase().includes(tag)
    const resultHas = (result.trackTitle?.toLowerCase().includes(tag) ?? false) || 
                      (result.artistName?.toLowerCase().includes(tag) ?? false)
    
    if (targetHas !== resultHas) return false
  }

  return true
}
