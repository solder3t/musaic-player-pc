import React from 'react'
import type { ReactNode } from 'react'
import type { LyricsFurigana } from '../../types/lyrics'

const INLINE_RUBY_REGEX = /<ruby>([\s\S]*?)<rt>([\s\S]*?)<\/rt><\/ruby>|\{([^|｜}]+)[|｜]([^}]+)\}/gi

export function hasRubyFurigana(text: string, furigana?: LyricsFurigana[]): boolean {
  if (furigana && furigana.length > 0) return true
  if (!text) return false
  INLINE_RUBY_REGEX.lastIndex = 0
  return INLINE_RUBY_REGEX.test(text)
}

export function parseRubySegments(
  text: string,
  furigana?: LyricsFurigana[]
): { cleanText: string; furigana: LyricsFurigana[] } {
  if (furigana && furigana.length > 0) {
    return { cleanText: text, furigana }
  }

  if (!text) {
    return { cleanText: '', furigana: [] }
  }

  INLINE_RUBY_REGEX.lastIndex = 0
  if (!INLINE_RUBY_REGEX.test(text)) {
    return { cleanText: text, furigana: [] }
  }

  INLINE_RUBY_REGEX.lastIndex = 0
  let match: RegExpExecArray | null
  let cleanText = ''
  let cursor = 0
  const extractedFurigana: LyricsFurigana[] = []

  while ((match = INLINE_RUBY_REGEX.exec(text)) !== null) {
    if (match.index > cursor) {
      cleanText += text.slice(cursor, match.index)
    }

    const base = (match[1] !== undefined ? match[1] : match[3]).trim()
    const reading = (match[2] !== undefined ? match[2] : match[4]).trim()

    const start = cleanText.length
    cleanText += base
    const end = cleanText.length

    if (base && reading) {
      extractedFurigana.push({
        start,
        end,
        base,
        reading
      })
    }

    cursor = match.index + match[0].length
  }

  if (cursor < text.length) {
    cleanText += text.slice(cursor)
  }

  return { cleanText, furigana: extractedFurigana }
}

export function renderTextWithFurigana(
  text: string,
  furigana: LyricsFurigana[] | undefined,
  enabled: boolean
): ReactNode {
  const parsed = parseRubySegments(text, furigana)
  if (!enabled || parsed.furigana.length === 0) {
    return parsed.cleanText
  }

  const parts: ReactNode[] = []
  let cursor = 0
  const sorted = [...parsed.furigana].sort((left, right) => left.start - right.start)

  sorted.forEach((entry, index) => {
    if (entry.start < cursor || entry.end > parsed.cleanText.length) return
    if (entry.start > cursor) {
      parts.push(parsed.cleanText.slice(cursor, entry.start))
    }
    parts.push(
      React.createElement(
        'ruby',
        { key: `ruby-${entry.start}-${entry.end}-${index}` },
        parsed.cleanText.slice(entry.start, entry.end),
        React.createElement('rt', null, entry.reading)
      )
    )
    cursor = entry.end
  })

  if (cursor < parsed.cleanText.length) {
    parts.push(parsed.cleanText.slice(cursor))
  }

  return parts.length > 0 ? parts : parsed.cleanText
}
