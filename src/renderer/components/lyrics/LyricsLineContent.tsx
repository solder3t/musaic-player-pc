
import type { LyricsDisplaySettings } from '../../stores/lyricsDisplaySettingsStore'
import {
  hasEnabledLyricsLineExtra,
  getPreferredLyricsTranslation,
  getLyricsWordDisplayState,
  getLyricsWordsForDisplay,
  getSyncedLyricsGapProgress,
  resolveLyricsWordTiming,
  type SyncedLyricsDisplayLine
} from '../../utils/lyricsPresentation'
import { renderTextWithFurigana, hasRubyFurigana } from '../../utils/rubyParsing'

interface LyricsLineContentProps {
  displayLine: SyncedLyricsDisplayLine
  currentTimeSeconds: number
  isActive: boolean
  settings: LyricsDisplaySettings
  seekTimeSeconds?: number | null
  seekTabIndex?: number
  onSeek?: (timeSeconds: number) => void
}

export default function LyricsLineContent({
  displayLine,
  currentTimeSeconds,
  isActive,
  settings,
  seekTimeSeconds = null,
  seekTabIndex,
  onSeek
}: LyricsLineContentProps) {
  if (displayLine.kind === 'gap') {
    const progress = getSyncedLyricsGapProgress(displayLine, currentTimeSeconds)
    if (progress === null) return null
    return (
      <span className="lyrics-gap-progress">
        <span
          className="lyrics-gap-progress-fill"
          style={{ transform: `scaleX(${progress})` }}
        />
      </span>
    )
  }

  const line = displayLine.line
  const words = getLyricsWordsForDisplay(line, settings.wordTimingEnabled)
  const wordTiming = isActive ? resolveLyricsWordTiming(words, currentTimeSeconds) : null
  const translation = settings.translationsEnabled
    ? getPreferredLyricsTranslation(line, settings.translationLanguagePriority)
    : null
  const hasRichExtra = hasEnabledLyricsLineExtra(line, settings) ||
    (settings.furiganaEnabled && (hasRubyFurigana(line.text, line.furigana) || words.some(w => hasRubyFurigana(w.text, w.furigana))))
  const contentClassName = [
    'lyrics-line-content',
    hasRichExtra ? 'has-rich-lyrics' : ''
  ].join(' ').trim()
  const normalizedSeekTime = typeof seekTimeSeconds === 'number' && Number.isFinite(seekTimeSeconds)
    ? seekTimeSeconds
    : null

  const content = (
    <>
      <span className="lyrics-line-main">
        {settings.voiceLabelsEnabled && line.voice && (
          <span className="lyrics-line-voice">{line.voice}</span>
        )}
        {words.length > 0 ? (
          <span className="lyrics-word-sequence">
            {words.map((word, index) => {
              const wordState = getLyricsWordDisplayState(index, wordTiming)
              return (
                <span
                  key={`${word.timestampMs}-${index}`}
                  className={[
                    'lyrics-word',
                    wordState !== 'idle' ? `is-${wordState}` : ''
                  ].join(' ').trim()}
                >
                  {renderTextWithFurigana(word.text, word.furigana, settings.furiganaEnabled)}
                </span>
              )
            })}
          </span>
        ) : (
          <span className="lyrics-line-text">
            {renderTextWithFurigana(line.text, line.furigana, settings.furiganaEnabled)}
          </span>
        )}
      </span>
      {translation && (
        <span className="lyrics-line-translation">{translation.text}</span>
      )}
    </>
  )

  if (normalizedSeekTime !== null && onSeek) {
    return (
      <button
        type="button"
        className={`${contentClassName} lyrics-line-seek-button`}
        onClick={() => onSeek(normalizedSeekTime)}
        tabIndex={seekTabIndex}
      >
        {content}
      </button>
    )
  }

  return (
    <span className={contentClassName}>
      {content}
    </span>
  )
}
