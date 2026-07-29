/**
 * Parses TTML (Timed Text Markup Language) into a standard LRC string.
 * This is a lightweight Regex-based parser as TTML payloads from lyrics APIs
 * are typically flat and predictable.
 */

export interface ParsedWord {
  text: string
  startTime: number
  endTime: number
}

export interface ParsedLine {
  text: string
  startTime: number
  words: ParsedWord[]
  isBackground: boolean
}

function parseTime(timeStr: string): number {
  try {
    if (timeStr.includes(':')) {
      const parts = timeStr.split(':')
      if (parts.length === 2) {
        const minutes = parseFloat(parts[0])
        const seconds = parseFloat(parts[1])
        return minutes * 60 + seconds
      }
      if (parts.length === 3) {
        const hours = parseFloat(parts[0])
        const minutes = parseFloat(parts[1])
        const seconds = parseFloat(parts[2])
        return hours * 3600 + minutes * 60 + seconds
      }
    }
    const val = parseFloat(timeStr)
    return isNaN(val) ? 0 : val
  } catch {
    return 0
  }
}

function formatLrcTimestamp(ms: number): string {
  const minutes = Math.floor(ms / 60000)
  const seconds = Math.floor((ms % 60000) / 1000)
  const centiseconds = Math.floor((ms % 1000) / 10)
  
  const m = minutes.toString().padStart(2, '0')
  const s = seconds.toString().padStart(2, '0')
  const cs = centiseconds.toString().padStart(2, '0')
  return `[${m}:${s}.${cs}]`
}

function formatWordTimestamp(ms: number): string {
  const minutes = Math.floor(ms / 60000)
  const seconds = Math.floor((ms % 60000) / 1000)
  const centiseconds = Math.floor((ms % 1000) / 10)
  
  const m = minutes.toString().padStart(2, '0')
  const s = seconds.toString().padStart(2, '0')
  const cs = centiseconds.toString().padStart(2, '0')
  return `<${m}:${s}.${cs}>`
}

export function parseTTML(ttml: string): ParsedLine[] {
  const lines: ParsedLine[] = []
  
  // Extract all <p ...> ... </p> blocks
  const pRegex = /<p[^>]*begin="([^"]+)"[^>]*>([\s\S]*?)<\/p>/gi
  let pMatch
  
  while ((pMatch = pRegex.exec(ttml)) !== null) {
    const beginTimeStr = pMatch[1]
    const pContent = pMatch[2]
    const startTime = parseTime(beginTimeStr)
    
    // Parse words from spans: <span begin="..." end="...">Word</span>
    const spanRegex = /<span[^>]*begin="([^"]+)"[^>]*end="([^"]+)"[^>]*>([^<]+)<\/span>/gi
    const words: ParsedWord[] = []
    let spanMatch
    
    while ((spanMatch = spanRegex.exec(pContent)) !== null) {
      words.push({
        text: spanMatch[3].trim(),
        startTime: parseTime(spanMatch[1]),
        endTime: parseTime(spanMatch[2])
      })
    }
    
    // Fallback: If no spans, just grab the text content
    let lineText = ''
    if (words.length > 0) {
      lineText = words.map(w => w.text).join(' ')
    } else {
      lineText = pContent.replace(/<[^>]+>/g, '').trim()
    }
    
    if (lineText) {
      // Very basic background tag detection (role="x-bg")
      const isBackground = pContent.includes('role="x-bg"') || pContent.includes('ttm:role="x-bg"')
      
      lines.push({
        text: lineText,
        startTime,
        words,
        isBackground
      })
    }
  }
  
  return lines
}

export function ttmlToLrc(ttml: string): string {
  const parsedLines = parseTTML(ttml)
  if (parsedLines.length === 0) return ''
  
  return parsedLines.map(line => {
    const timeMs = Math.round(line.startTime * 1000)
    let out = formatLrcTimestamp(timeMs)
    
    if (line.isBackground) {
      out += '(Background) '
    }
    
    if (line.words.length > 0) {
      out += line.words.map(w => {
        const wordStartMs = Math.round(w.startTime * 1000)
        return `${formatWordTimestamp(wordStartMs)}${w.text}`
      }).join(' ')
    } else {
      out += line.text
    }
    
    return out
  }).join('\n')
}
