import { memo, useCallback, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'

export const ALPHABET_CHARACTERS = [
  '#',
  'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M',
  'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z'
] as const

export function getLetterBucket(text: string | null | undefined): string {
  const trimmed = (text ?? '').trim()
  if (!trimmed) return '#'
  const firstChar = trimmed.charAt(0).toUpperCase()
  if (firstChar >= 'A' && firstChar <= 'Z') {
    return firstChar
  }
  return '#'
}

interface AlphabetScrollerProps {
  availableLetters: Set<string>
  activeLetter?: string | null
  onSelectLetter: (letter: string) => void
  className?: string
}

export const AlphabetScroller = memo(function AlphabetScroller({
  availableLetters,
  activeLetter,
  onSelectLetter,
  className = ''
}: AlphabetScrollerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [isScrubbing, setIsScrubbing] = useState(false)
  const [previewLetter, setPreviewLetter] = useState<string | null>(null)
  const [previewTop, setPreviewTop] = useState<number>(0)
  const isPointerDownRef = useRef(false)

  const resolveLetterFromPoint = useCallback((clientY: number): { letter: string; top: number } | null => {
    const container = containerRef.current
    if (!container) return null

    const rect = container.getBoundingClientRect()
    if (rect.height <= 0) return null

    const clampedY = Math.max(rect.top, Math.min(rect.bottom - 1, clientY))
    const ratio = (clampedY - rect.top) / rect.height
    const index = Math.floor(ratio * ALPHABET_CHARACTERS.length)
    const clampedIndex = Math.max(0, Math.min(ALPHABET_CHARACTERS.length - 1, index))
    const letter = ALPHABET_CHARACTERS[clampedIndex]

    // Calculate approximate center position for the bubble indicator
    const letterHeight = rect.height / ALPHABET_CHARACTERS.length
    const top = (clampedIndex + 0.5) * letterHeight

    return { letter, top }
  }, [])

  const handlePointerDown = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    isPointerDownRef.current = true
    setIsScrubbing(true)

    const target = e.currentTarget
    target.setPointerCapture(e.pointerId)

    const resolved = resolveLetterFromPoint(e.clientY)
    if (resolved) {
      setPreviewLetter(resolved.letter)
      setPreviewTop(resolved.top)
      onSelectLetter(resolved.letter)
    }
  }, [onSelectLetter, resolveLetterFromPoint])

  const handlePointerMove = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    if (!isPointerDownRef.current) return
    e.preventDefault()

    const resolved = resolveLetterFromPoint(e.clientY)
    if (resolved) {
      setPreviewLetter(resolved.letter)
      setPreviewTop(resolved.top)
      onSelectLetter(resolved.letter)
    }
  }, [onSelectLetter, resolveLetterFromPoint])

  const handlePointerUp = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    if (isPointerDownRef.current) {
      isPointerDownRef.current = false
      setIsScrubbing(false)
      setPreviewLetter(null)
      try {
        e.currentTarget.releasePointerCapture(e.pointerId)
      } catch {
        // ignore
      }
    }
  }, [])

  const handlePointerCancel = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    if (isPointerDownRef.current) {
      isPointerDownRef.current = false
      setIsScrubbing(false)
      setPreviewLetter(null)
      try {
        e.currentTarget.releasePointerCapture(e.pointerId)
      } catch {
        // ignore
      }
    }
  }, [])

  return (
    <div
      ref={containerRef}
      className={`alphabet-scroller ${isScrubbing ? 'is-scrubbing' : ''} ${className}`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      role="navigation"
      aria-label="Alphabet quick jump"
    >
      {isScrubbing && previewLetter && (
        <div
          className="alphabet-bubble-indicator"
          style={{ top: `${previewTop}px` }}
          aria-hidden="true"
        >
          {previewLetter}
        </div>
      )}
      <div className="alphabet-letter-list">
        {ALPHABET_CHARACTERS.map((char) => {
          const isAvailable = availableLetters.has(char)
          const isActive = (previewLetter ?? activeLetter) === char

          return (
            <button
              key={char}
              type="button"
              tabIndex={-1}
              className={`alphabet-letter-btn ${isAvailable ? 'is-available' : 'is-empty'} ${isActive ? 'is-active' : ''}`}
              onClick={(e) => {
                e.stopPropagation()
                onSelectLetter(char)
              }}
              title={`Jump to ${char}`}
            >
              {char}
            </button>
          )
        })}
      </div>
    </div>
  )
})

export default AlphabetScroller
