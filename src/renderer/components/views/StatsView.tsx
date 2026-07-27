import { useEffect, useMemo, useState } from 'react'
import type {
  ListeningStatsActivityBucket,
  ListeningStatsRange,
  ListeningStatsRankedAlbum,
  ListeningStatsRankedArtist,
  ListeningStatsRankedTrack
} from '../../../types/listeningStats'
import { useLibraryStore } from '../../stores/libraryStore'
import { useListeningStatsStore } from '../../stores/listeningStatsStore'
import { usePlayerStore } from '../../stores/playerStore'
import { useUIStore } from '../../stores/uiStore'
import { formatExactDuration } from '../../utils/collectionDuration'
import AlbumArtwork from '../library/AlbumArtwork'
import StatsShareModal from '../stats/StatsShareModal'
import AiStatisticsScreen from '../stats/AiStatisticsScreen'

const RANGE_OPTIONS: Array<{ value: ListeningStatsRange; label: string }> = [
  { value: '7d', label: '7D' },
  { value: '30d', label: '30D' },
  { value: '1y', label: '1Y' },
  { value: 'all', label: 'All' }
]

function formatCount(value: number, noun: string): string {
  const rounded = Math.max(0, Math.round(value))
  return `${rounded.toLocaleString()} ${noun}${rounded === 1 ? '' : 's'}`
}

function formatBaseline(timestamp: number): string {
  return new Date(timestamp).toLocaleString([], {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  })
}

function ActivityChart({ buckets }: { buckets: ListeningStatsActivityBucket[] }) {
  const maxSeconds = Math.max(0, ...buckets.map((bucket) => bucket.listenedSeconds))

  return (
    <div className="listening-stats-chart" role="group" aria-label="Listening time activity chart">
      {buckets.map((bucket, index) => {
        const exactTime = formatExactDuration(bucket.listenedSeconds)
        const plays = formatCount(bucket.qualifiedPlays, 'play')
        const height = maxSeconds > 0 && bucket.listenedSeconds > 0
          ? Math.max(2, (bucket.listenedSeconds / maxSeconds) * 100)
          : 0
        const animationDelay = buckets.length > 1
          ? `${Math.round((index / (buckets.length - 1)) * 240)}ms`
          : '0ms'

        return (
          <div key={bucket.startAt} className="listening-stats-chart-column">
            <div
              className="listening-stats-chart-bar"
              style={{ height: `${height}%`, animationDelay }}
              title={`${bucket.label}: ${exactTime} across ${plays}`}
            />
            <span className="listening-stats-chart-label">{bucket.label}</span>
          </div>
        )
      })}
    </div>
  )
}

interface RankingItem {
  key: string
  artworkHash: string | null
  available?: boolean
  qualifiedPlays: number
  listenedSeconds: number
}

function RankingCard<T extends RankingItem>({
  title,
  items,
  emptyLabel,
  getKey,
  getTitle,
  getSubtitle,
  getArtworkHash,
  getAvailable,
  getPlays,
  getSeconds,
  onOpen
}: {
  title: string
  items: T[]
  emptyLabel: string
  getKey: (item: T) => string
  getTitle: (item: T) => string
  getSubtitle: (item: T) => string
  getArtworkHash: (item: T) => string | null
  getAvailable?: (item: T) => boolean | undefined
  getPlays: (item: T) => number
  getSeconds: (item: T) => number
  onOpen: (item: T) => void
}) {
  return (
    <section className="listening-stats-card">
      <header className="listening-stats-card-header">
        <h2>{title}</h2>
      </header>
      {items.length === 0 ? (
        <p className="listening-stats-card-empty">{emptyLabel}</p>
      ) : (
        <ol className="listening-stats-ranking-list">
          {items.map((item, index) => {
            const available = getAvailable ? getAvailable(item) : true
            const isMissing = available === false
            return (
              <li
                key={getKey(item)}
                className={`listening-stats-ranking-row${isMissing ? ' is-missing-item' : ''}`}
              >
                <span className="listening-stats-ranking-rank">{index + 1}</span>
                <button
                  type="button"
                  className="listening-stats-ranking-main"
                  onClick={() => onOpen(item)}
                  disabled={isMissing}
                >
                  <span className="listening-stats-ranking-artwork">
                    <AlbumArtwork
                      hash={getArtworkHash(item)}
                      alt={getTitle(item)}
                      className="listening-stats-ranking-artwork-image"
                    />
                  </span>
                  <span className="listening-stats-ranking-copy">
                    <span className="listening-stats-ranking-title">{getTitle(item)}</span>
                    <span className="listening-stats-ranking-subtitle">{getSubtitle(item)}</span>
                  </span>
                </button>
                <span className="listening-stats-ranking-metrics">
                  <strong>{formatExactDuration(getSeconds(item))}</strong>
                  <span>{formatCount(getPlays(item), 'play')}</span>
                </span>
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}

export default function StatsView() {
  const range = useListeningStatsStore((state) => state.range)
  const rankingMetric = useListeningStatsStore((state) => state.rankingMetric)
  const dashboard = useListeningStatsStore((state) => state.dashboard)
  const isLoading = useListeningStatsStore((state) => state.isLoading)
  const error = useListeningStatsStore((state) => state.error)
  const setRange = useListeningStatsStore((state) => state.setRange)
  const setRankingMetric = useListeningStatsStore((state) => state.setRankingMetric)
  const loadDashboard = useListeningStatsStore((state) => state.loadDashboard)
  const setActiveView = useUIStore((state) => state.setActiveView)
  const artistBrowseMode = useLibraryStore((state) => state.artistBrowseMode)
  const setLibraryViewMode = useLibraryStore((state) => state.setViewMode)
  const selectArtist = useLibraryStore((state) => state.selectArtist)
  const selectAlbum = useLibraryStore((state) => state.selectAlbum)
  const startPlaybackContextByPaths = usePlayerStore((state) => state.startPlaybackContextByPaths)
  const [shareSnapshot, setShareSnapshot] = useState<typeof dashboard>(null)
  const [activeTab, setActiveTab] = useState<'ai' | 'standard'>('ai')

  useEffect(() => {
    void loadDashboard()
    const refreshInterval = window.setInterval(() => {
      void loadDashboard()
    }, 10_000)
    let checkpointRefreshTimeout: number | null = null
    const handleCheckpoint = () => {
      if (checkpointRefreshTimeout != null) window.clearTimeout(checkpointRefreshTimeout)
      checkpointRefreshTimeout = window.setTimeout(() => {
        checkpointRefreshTimeout = null
        void loadDashboard()
      }, 350)
    }
    window.addEventListener('musaic:listening-history-checkpoint', handleCheckpoint)
    return () => {
      window.clearInterval(refreshInterval)
      window.removeEventListener('musaic:listening-history-checkpoint', handleCheckpoint)
      if (checkpointRefreshTimeout != null) window.clearTimeout(checkpointRefreshTimeout)
    }
  }, [artistBrowseMode, loadDashboard])

  const playableTrackPaths = useMemo(
    () => dashboard?.topTracks.flatMap((track) => track.available && track.trackPath ? [track.trackPath] : []) ?? [],
    [dashboard]
  )

  const handlePlayTrack = (track: ListeningStatsRankedTrack) => {
    if (!track.trackPath) return
    const index = playableTrackPaths.indexOf(track.trackPath)
    if (index < 0) return
    void startPlaybackContextByPaths(playableTrackPaths, index, { contextLabel: 'Listening Stats' })
  }

  const handleOpenArtist = (artist: ListeningStatsRankedArtist) => {
    setLibraryViewMode('artists')
    void selectArtist(artist.artist, 'library').then(() => setActiveView('library'))
  }

  const handleOpenAlbum = (album: ListeningStatsRankedAlbum) => {
    setLibraryViewMode('albums')
    void selectAlbum(album.album, album.artist, 'library', album.key).then(() => setActiveView('library'))
  }

  const hasDetailedHistory = dashboard?.status.startedAt != null
  const hasRangeActivity = Boolean(
    dashboard && (dashboard.summary.listenedSeconds > 0 || dashboard.summary.qualifiedPlays > 0)
  )

  return (
    <div className="listening-stats-view">
      <header className="listening-stats-header">
        <div>
          <p className="listening-stats-eyebrow">Your Library</p>
          <h1>Listening Stats</h1>
          <p>Local listening time and qualified plays from this installation.</p>
        </div>
        <div className="listening-stats-header-actions">
          <button
            className="listening-stats-share-button"
            type="button"
            disabled={!dashboard || !hasDetailedHistory || !hasRangeActivity}
            title={hasRangeActivity ? 'Create a shareable listening-stats image' : 'Listen to something in this range before sharing'}
            onClick={() => setShareSnapshot(dashboard)}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="18" cy="5" r="3" />
              <circle cx="6" cy="12" r="3" />
              <circle cx="18" cy="19" r="3" />
              <path d="m8.6 10.5 6.8-4M8.6 13.5l6.8 4" />
            </svg>
            Share
          </button>
          <div className="listening-stats-range-control" role="group" aria-label="Listening stats date range">
            {RANGE_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                className={range === option.value ? 'active' : ''}
                aria-pressed={range === option.value}
                onClick={() => setRange(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      <div style={{ display: 'flex', gap: '12px', padding: '16px 32px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <button
          type="button"
          onClick={() => setActiveTab('ai')}
          style={{
            padding: '10px 20px',
            borderRadius: '14px',
            fontWeight: 800,
            fontSize: '14px',
            border: 'none',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            background: activeTab === 'ai' ? 'linear-gradient(135deg, #a855f7, #ec4899)' : 'rgba(255,255,255,0.06)',
            color: activeTab === 'ai' ? '#fff' : '#9ca3af',
            boxShadow: activeTab === 'ai' ? '0 4px 15px rgba(168, 85, 247, 0.35)' : 'none'
          }}
        >
          🤖 AI Sonic Intelligence
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('standard')}
          style={{
            padding: '10px 20px',
            borderRadius: '14px',
            fontWeight: 800,
            fontSize: '14px',
            border: 'none',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            background: activeTab === 'standard' ? 'linear-gradient(135deg, #a855f7, #ec4899)' : 'rgba(255,255,255,0.06)',
            color: activeTab === 'standard' ? '#fff' : '#9ca3af',
            boxShadow: activeTab === 'standard' ? '0 4px 15px rgba(168, 85, 247, 0.35)' : 'none'
          }}
        >
          📊 Standard Statistics
        </button>
      </div>

      {activeTab === 'ai' ? (
        <AiStatisticsScreen />
      ) : (
        <>
          {error && (
            <div className="listening-stats-state listening-stats-state-error" role="alert">
              <strong>Listening Stats could not be loaded.</strong>
              <span>{error}</span>
              <button type="button" onClick={() => void loadDashboard()}>Try Again</button>
            </div>
          )}

          {!error && isLoading && !dashboard && (
            <div className="listening-stats-state" role="status">Loading listening history…</div>
          )}

          {!error && dashboard && !hasDetailedHistory && (
            <div className="listening-stats-state">
              <strong>No detailed listening history yet</strong>
              <span>Play something from your library to begin. Existing play counts are intentionally not included here.</span>
            </div>
          )}

          {!error && dashboard && hasDetailedHistory && (
            <>
              <p className="listening-stats-baseline">
                Detailed history since {formatBaseline(dashboard.status.startedAt!)}
                {isLoading ? <span role="status"> · Refreshing…</span> : null}
              </p>

              <section className="listening-stats-summary" aria-label="Listening summary">
                <article>
                  <span>Listening Time</span>
                  <strong>{formatExactDuration(dashboard.summary.listenedSeconds)}</strong>
                </article>
                <article>
                  <span>Qualified Plays</span>
                  <strong>{dashboard.summary.qualifiedPlays.toLocaleString()}</strong>
                </article>
                <article>
                  <span>Tracks Played</span>
                  <strong>{dashboard.summary.tracksPlayed.toLocaleString()}</strong>
                </article>
                <article>
                  <span>Active Days</span>
                  <strong>{dashboard.summary.activeDays.toLocaleString()}</strong>
                </article>
              </section>

              {!hasRangeActivity ? (
                <div className="listening-stats-state listening-stats-state-compact">
                  <strong>No listening in this range</strong>
                  <span>Choose another range or start playing a library track.</span>
                </div>
              ) : (
                <>
                  <section className="listening-stats-activity-card">
                    <div className="listening-stats-section-heading">
                      <div>
                        <p>Activity</p>
                        <h2>Listening Time</h2>
                      </div>
                      <span>Focus or hover a bar for exact time.</span>
                    </div>
                    <ActivityChart key={dashboard.range} buckets={dashboard.activity} />
                  </section>

                  <div className="listening-stats-rankings-heading">
                    <div>
                      <p>Rankings</p>
                      <h2>Your Top Listening</h2>
                    </div>
                    <div className="listening-stats-metric-control" role="group" aria-label="Rank listening results by">
                      <button
                        type="button"
                        className={rankingMetric === 'plays' ? 'active' : ''}
                        aria-pressed={rankingMetric === 'plays'}
                        onClick={() => setRankingMetric('plays')}
                      >
                        Plays
                      </button>
                      <button
                        type="button"
                        className={rankingMetric === 'time' ? 'active' : ''}
                        aria-pressed={rankingMetric === 'time'}
                        onClick={() => setRankingMetric('time')}
                      >
                        Time
                      </button>
                    </div>
                  </div>

                  <div className="listening-stats-rankings-grid">
                    <RankingCard
                      title="Top Tracks"
                      items={dashboard.topTracks}
                      emptyLabel="No tracks in this range."
                      getKey={(track) => track.key}
                      getTitle={(track) => track.title}
                      getSubtitle={(track) => `${track.artist} · ${track.album}`}
                      getArtworkHash={(track) => track.artworkHash}
                      getAvailable={(track) => track.available}
                      getPlays={(track) => track.qualifiedPlays}
                      getSeconds={(track) => track.listenedSeconds}
                      onOpen={handlePlayTrack}
                    />
                    <RankingCard
                      title="Top Artists"
                      items={dashboard.topArtists}
                      emptyLabel="No artists in this range."
                      getKey={(artist) => artist.key}
                      getTitle={(artist) => artist.artist}
                      getSubtitle={() => 'Artist'}
                      getArtworkHash={(artist) => artist.artworkHash}
                      getAvailable={(artist) => artist.available}
                      getPlays={(artist) => artist.qualifiedPlays}
                      getSeconds={(artist) => artist.listenedSeconds}
                      onOpen={handleOpenArtist}
                    />
                    <RankingCard
                      title="Top Albums"
                      items={dashboard.topAlbums}
                      emptyLabel="No albums in this range."
                      getKey={(album) => album.key}
                      getTitle={(album) => album.album}
                      getSubtitle={(album) => album.artist}
                      getArtworkHash={(album) => album.artworkHash}
                      getAvailable={(album) => album.available}
                      getPlays={(album) => album.qualifiedPlays}
                      getSeconds={(album) => album.listenedSeconds}
                      onOpen={handleOpenAlbum}
                    />
                  </div>
                </>
              )}
            </>
          )}
        </>
      )}

      <StatsShareModal
        isOpen={shareSnapshot !== null}
        snapshot={shareSnapshot}
        onClose={() => setShareSnapshot(null)}
      />
    </div>
  )
}
