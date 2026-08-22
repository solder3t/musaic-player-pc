import { useEffect, useMemo, useState } from 'react'
import { usePresence } from '../../hooks/usePresence'
import { useLyricsStore } from '../../stores/lyricsStore'

function formatDuration(ms?: number | null): string {
  if (!ms || ms <= 0) return '--:--'
  const totalSeconds = Math.round(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

function getProviderBadgeColor(provider: string): { bg: string; text: string; border: string } {
  switch (provider.toLowerCase()) {
    case 'xlrcdb':
      return { bg: 'rgba(168, 85, 247, 0.15)', text: '#c084fc', border: 'rgba(168, 85, 247, 0.3)' }
    case 'lrclib':
      return { bg: 'rgba(6, 182, 212, 0.15)', text: '#22d3ee', border: 'rgba(6, 182, 212, 0.3)' }
    case 'kugou':
      return { bg: 'rgba(59, 130, 246, 0.15)', text: '#60a5fa', border: 'rgba(59, 130, 246, 0.3)' }
    case 'netease':
      return { bg: 'rgba(239, 68, 68, 0.15)', text: '#f87171', border: 'rgba(239, 68, 68, 0.3)' }
    case 'betterlyrics':
      return { bg: 'rgba(236, 72, 153, 0.15)', text: '#f472b6', border: 'rgba(236, 72, 153, 0.3)' }
    case 'genius':
      return { bg: 'rgba(234, 179, 8, 0.15)', text: '#facc15', border: 'rgba(234, 179, 8, 0.3)' }
    default:
      return { bg: 'rgba(156, 163, 175, 0.15)', text: '#9ca3af', border: 'rgba(156, 163, 175, 0.3)' }
  }
}

export default function LyricsSearchModal() {
  const isOpen = useLyricsStore((state) => state.searchModalOpen)
  const candidates = useLyricsStore((state) => state.searchCandidates)
  const isSearching = useLyricsStore((state) => state.isSearchingCandidates)
  const searchQuery = useLyricsStore((state) => state.searchQuery)
  const searchError = useLyricsStore((state) => state.searchError)
  const close = useLyricsStore((state) => state.closeSearchModal)
  const performSearch = useLyricsStore((state) => state.performSearch)
  const applyCandidate = useLyricsStore((state) => state.applyCandidate)

  const presence = usePresence(isOpen)

  const [titleInput, setTitleInput] = useState('')
  const [artistInput, setArtistInput] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [filterType, setFilterType] = useState<'all' | 'synced' | 'plain'>('all')
  const [isApplying, setIsApplying] = useState(false)

  useEffect(() => {
    if (searchQuery) {
      setTitleInput(searchQuery.title || '')
      setArtistInput(searchQuery.artist || '')
    }
  }, [searchQuery])

  useEffect(() => {
    if (candidates.length > 0) {
      setSelectedId((prev) => {
        if (prev && candidates.some((c) => c.id === prev)) return prev
        return candidates[0].id
      })
    } else {
      setSelectedId(null)
    }
  }, [candidates])

  // Handle escape key
  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        close()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, close])

  const filteredCandidates = useMemo(() => {
    if (filterType === 'synced') return candidates.filter((c) => c.isSynced)
    if (filterType === 'plain') return candidates.filter((c) => !c.isSynced)
    return candidates
  }, [candidates, filterType])

  const selectedCandidate = useMemo(() => {
    if (!selectedId) return filteredCandidates[0] || null
    return candidates.find((c) => c.id === selectedId) || filteredCandidates[0] || null
  }, [candidates, filteredCandidates, selectedId])

  const targetDurationMs = searchQuery?.durationSeconds ? searchQuery.durationSeconds * 1000 : null

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!titleInput.trim() && !artistInput.trim()) return
    void performSearch(titleInput, artistInput)
  }

  const handleApply = async () => {
    if (!selectedCandidate) return
    setIsApplying(true)
    try {
      await applyCandidate(selectedCandidate)
    } finally {
      setIsApplying(false)
    }
  }

  if (!presence.shouldRender) return null

  const syncedCount = candidates.filter((c) => c.isSynced).length
  const plainCount = candidates.filter((c) => !c.isSynced).length

  return (
    <div
      className="modal-overlay lyrics-search-modal-overlay"
      data-presence={presence.phase}
      aria-hidden={presence.phase === 'exiting'}
      onClick={close}
    >
      <div
        className="modal-content lyrics-search-modal"
        style={{
          width: '90vw',
          maxWidth: '920px',
          height: '80vh',
          maxHeight: '740px',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          padding: 0
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="modal-header"
          style={{
            padding: '20px 24px 14px',
            borderBottom: '1px solid var(--border-subtle, rgba(255, 255, 255, 0.08))',
            flexShrink: 0
          }}
        >
          <div>
            <div className="library-integrity-kicker" style={{ fontSize: '0.78em', opacity: 0.7, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              Online Lyrics Search
            </div>
            <h2 style={{ margin: '4px 0 2px', fontSize: '1.35em', fontWeight: 600 }}>Select Track Lyrics</h2>
            <p style={{ margin: 0, fontSize: '0.84em', opacity: 0.75 }}>
              Browse synchronized and plain lyrics fetched across online providers (XLRCDB, LRCLIB, KuGou, NetEase, BetterLyrics, Genius).
            </p>
          </div>
          <button className="modal-close" onClick={close} aria-label="Close">
            ✕
          </button>
        </div>

        {/* Search Bar */}
        <form
          onSubmit={handleSearchSubmit}
          style={{
            padding: '14px 24px',
            background: 'var(--bg-card, rgba(255, 255, 255, 0.03))',
            borderBottom: '1px solid var(--border-subtle, rgba(255, 255, 255, 0.08))',
            display: 'flex',
            gap: '10px',
            alignItems: 'center',
            flexWrap: 'wrap',
            flexShrink: 0
          }}
        >
          <div style={{ flex: 1, minWidth: '160px' }}>
            <input
              type="text"
              className="settings-input"
              style={{ width: '100%', height: '36px' }}
              placeholder="Track Title"
              value={titleInput}
              onChange={(e) => setTitleInput(e.target.value)}
              disabled={isSearching}
            />
          </div>
          <div style={{ flex: 1, minWidth: '160px' }}>
            <input
              type="text"
              className="settings-input"
              style={{ width: '100%', height: '36px' }}
              placeholder="Artist"
              value={artistInput}
              onChange={(e) => setArtistInput(e.target.value)}
              disabled={isSearching}
            />
          </div>
          <button
            type="submit"
            className="settings-button"
            style={{
              height: '36px',
              padding: '0 18px',
              background: 'var(--accent, #3b82f6)',
              color: '#ffffff',
              border: 'none',
              fontWeight: 500,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px'
            }}
            disabled={isSearching}
          >
            {isSearching ? '🔍 Searching...' : '🔍 Search'}
          </button>
        </form>

        {/* Filter Toolbar & Summary */}
        <div
          style={{
            padding: '10px 24px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: 'var(--bg-subtle, rgba(0, 0, 0, 0.15))',
            borderBottom: '1px solid var(--border-subtle, rgba(255, 255, 255, 0.06))',
            fontSize: '0.85em',
            flexShrink: 0
          }}
        >
          <div style={{ display: 'flex', gap: '6px' }}>
            <button
              type="button"
              className={`settings-chip ${filterType === 'all' ? 'active' : ''}`}
              style={{
                cursor: 'pointer',
                padding: '4px 10px',
                borderRadius: '12px',
                border: '1px solid',
                borderColor: filterType === 'all' ? 'var(--accent, #3b82f6)' : 'transparent',
                background: filterType === 'all' ? 'rgba(59, 130, 246, 0.2)' : 'rgba(255, 255, 255, 0.05)'
              }}
              onClick={() => setFilterType('all')}
            >
              All ({candidates.length})
            </button>
            <button
              type="button"
              className={`settings-chip ${filterType === 'synced' ? 'active' : ''}`}
              style={{
                cursor: 'pointer',
                padding: '4px 10px',
                borderRadius: '12px',
                border: '1px solid',
                borderColor: filterType === 'synced' ? 'var(--accent, #3b82f6)' : 'transparent',
                background: filterType === 'synced' ? 'rgba(59, 130, 246, 0.2)' : 'rgba(255, 255, 255, 0.05)'
              }}
              onClick={() => setFilterType('synced')}
            >
              ⚡ Synced ({syncedCount})
            </button>
            <button
              type="button"
              className={`settings-chip ${filterType === 'plain' ? 'active' : ''}`}
              style={{
                cursor: 'pointer',
                padding: '4px 10px',
                borderRadius: '12px',
                border: '1px solid',
                borderColor: filterType === 'plain' ? 'var(--accent, #3b82f6)' : 'transparent',
                background: filterType === 'plain' ? 'rgba(59, 130, 246, 0.2)' : 'rgba(255, 255, 255, 0.05)'
              }}
              onClick={() => setFilterType('plain')}
            >
              📝 Plain ({plainCount})
            </button>
          </div>

          <div style={{ opacity: 0.7 }}>
            {targetDurationMs ? `Track duration: ${formatDuration(targetDurationMs)}` : ''}
          </div>
        </div>

        {/* Content: Split List and Preview */}
        <div
          style={{
            flex: 1,
            display: 'grid',
            gridTemplateColumns: 'minmax(320px, 1fr) minmax(360px, 1.2fr)',
            minHeight: 0,
            overflow: 'hidden'
          }}
        >
          {/* Candidate List */}
          <div
            style={{
              overflowY: 'auto',
              borderRight: '1px solid var(--border-subtle, rgba(255, 255, 255, 0.08))',
              padding: '12px'
            }}
          >
            {isSearching && candidates.length === 0 ? (
              <div style={{ padding: '40px 20px', textAlign: 'center', opacity: 0.7 }}>
                <div style={{ fontSize: '1.8em', marginBottom: '8px' }}>⏳</div>
                <div>Searching all online lyrics providers...</div>
              </div>
            ) : filteredCandidates.length === 0 ? (
              <div style={{ padding: '40px 20px', textAlign: 'center', opacity: 0.7 }}>
                <div style={{ fontSize: '1.8em', marginBottom: '8px' }}>🔍</div>
                <div>{searchError || 'No lyrics found.'}</div>
                <p style={{ fontSize: '0.84em', marginTop: '6px', opacity: 0.8 }}>
                  Try refining the song title or artist name in the search bar above.
                </p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {filteredCandidates.map((candidate) => {
                  const isSelected = selectedCandidate?.id === candidate.id
                  const badge = getProviderBadgeColor(candidate.provider)
                  const durationDiff = (targetDurationMs && candidate.durationMs)
                    ? Math.abs(candidate.durationMs - targetDurationMs) / 1000
                    : null
                  const isDurationClose = durationDiff !== null && durationDiff <= 3

                  return (
                    <div
                      key={candidate.id}
                      onClick={() => setSelectedId(candidate.id)}
                      style={{
                        padding: '12px 14px',
                        borderRadius: '8px',
                        border: '1px solid',
                        borderColor: isSelected
                          ? 'var(--accent, #3b82f6)'
                          : 'var(--border-subtle, rgba(255, 255, 255, 0.06))',
                        background: isSelected
                          ? 'rgba(59, 130, 246, 0.12)'
                          : 'var(--bg-card, rgba(255, 255, 255, 0.02))',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      {/* Top Badges */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                          <span
                            style={{
                              fontSize: '0.72em',
                              fontWeight: 700,
                              padding: '2px 7px',
                              borderRadius: '4px',
                              background: badge.bg,
                              color: badge.text,
                              border: `1px solid ${badge.border}`,
                              textTransform: 'uppercase'
                            }}
                          >
                            {candidate.providerLabel}
                          </span>
                          {candidate.isSynced ? (
                            <span
                              style={{
                                fontSize: '0.72em',
                                padding: '2px 6px',
                                borderRadius: '4px',
                                background: 'rgba(34, 197, 94, 0.15)',
                                color: '#4ade80',
                                border: '1px solid rgba(34, 197, 94, 0.3)'
                              }}
                            >
                              ⚡ Synced
                            </span>
                          ) : (
                            <span
                              style={{
                                fontSize: '0.72em',
                                padding: '2px 6px',
                                borderRadius: '4px',
                                background: 'rgba(156, 163, 175, 0.15)',
                                color: '#9ca3af'
                              }}
                            >
                              📝 Plain
                            </span>
                          )}
                          {candidate.format === 'xlrc' && (
                            <span
                              style={{
                                fontSize: '0.72em',
                                padding: '2px 6px',
                                borderRadius: '4px',
                                background: 'rgba(244, 114, 182, 0.15)',
                                color: '#f472b6',
                                border: '1px solid rgba(244, 114, 182, 0.3)'
                              }}
                            >
                              ✨ Rich XLRC
                            </span>
                          )}
                        </div>

                        <div style={{ fontSize: '0.78em', opacity: 0.75 }}>
                          {candidate.durationMs ? (
                            <span style={{ color: isDurationClose ? '#4ade80' : 'inherit' }}>
                              ⏱ {formatDuration(candidate.durationMs)}
                            </span>
                          ) : null}
                        </div>
                      </div>

                      {/* Song info */}
                      <div style={{ fontWeight: 600, fontSize: '0.92em', marginBottom: '2px' }}>
                        {candidate.title || 'Untitled'}
                      </div>
                      <div style={{ fontSize: '0.82em', opacity: 0.75, marginBottom: '6px' }}>
                        {candidate.artist || 'Unknown Artist'}
                        {candidate.album ? ` • ${candidate.album}` : ''}
                      </div>

                      {/* Snippet */}
                      {candidate.sampleLyrics && (
                        <div
                          style={{
                            fontSize: '0.78em',
                            opacity: 0.6,
                            whiteSpace: 'pre-line',
                            lineHeight: 1.3,
                            maxHeight: '38px',
                            overflow: 'hidden'
                          }}
                        >
                          {candidate.sampleLyrics}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Full Lyrics Preview Pane */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              minHeight: 0,
              background: 'var(--bg-main, rgba(0, 0, 0, 0.2))'
            }}
          >
            {selectedCandidate ? (
              <>
                <div
                  style={{
                    padding: '12px 20px',
                    borderBottom: '1px solid var(--border-subtle, rgba(255, 255, 255, 0.06))',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexShrink: 0
                  }}
                >
                  <div>
                    <span style={{ fontWeight: 600, fontSize: '0.95em' }}>
                      {selectedCandidate.title || 'Untitled'}
                    </span>
                    <span style={{ opacity: 0.6, fontSize: '0.85em', marginLeft: '8px' }}>
                      via {selectedCandidate.providerLabel}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="settings-button"
                    style={{
                      background: 'var(--accent, #3b82f6)',
                      color: '#ffffff',
                      border: 'none',
                      padding: '6px 16px',
                      borderRadius: '6px',
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                    onClick={handleApply}
                    disabled={isApplying}
                  >
                    {isApplying ? 'Applying...' : '✓ Use These Lyrics'}
                  </button>
                </div>

                <div
                  style={{
                    flex: 1,
                    overflowY: 'auto',
                    padding: '20px',
                    fontSize: '0.9em',
                    lineHeight: 1.65,
                    whiteSpace: 'pre-wrap',
                    fontFamily: selectedCandidate.isSynced ? 'var(--font-mono, monospace)' : 'inherit',
                    opacity: 0.9
                  }}
                >
                  {selectedCandidate.syncedLyrics || selectedCandidate.plainLyrics || '(No lyrics content)'}
                </div>
              </>
            ) : (
              <div
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: 0.5,
                  fontSize: '0.9em'
                }}
              >
                Select a lyrics version on the left to preview
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div
          className="modal-footer"
          style={{
            padding: '12px 24px',
            borderTop: '1px solid var(--border-subtle, rgba(255, 255, 255, 0.08))',
            display: 'flex',
            alignItems: 'center',
            flexShrink: 0
          }}
        >
          <div style={{ fontSize: '0.82em', opacity: 0.6 }}>
            Applying selected lyrics will update the active track and save it to your local cache.
          </div>
        </div>
      </div>
    </div>
  )
}
