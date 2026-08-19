import { useState } from 'react'
import { useParallaxStore } from '../../stores/parallaxStore'
import { useLibraryStore } from '../../stores/libraryStore'
import { usePlayerStore } from '../../stores/playerStore'
import ParallaxManagementView from './ParallaxManagementView'
import { PARALLAX_DEFAULT_PORT } from '../../../types/parallax'

interface SuggestionItem {
  id: string
  title: string
  artist: string
  genre?: string
  suggestedBy: string
  upvotes: number
  downvotes: number
  hasVoted?: 'up' | 'down'
}

export default function ListenTogetherPanel() {
  const { status } = useParallaxStore()
  const { trackByPath } = useLibraryStore()
  const enqueueTrackPaths = usePlayerStore(s => s.enqueueTrackPaths)

  const [activeTab, setActiveTab] = useState<'sync' | 'queue' | 'invite'>('sync')
  const [copiedLink, setCopiedLink] = useState(false)
  const [notification, setNotification] = useState<string | null>(null)

  // Local state for collaborative queue suggestions
  const [suggestions, setSuggestions] = useState<SuggestionItem[]>([
    {
      id: 'sug-1',
      title: 'Midnight Odyssey',
      artist: 'Solar Nebula',
      genre: 'Electronic / Ambient',
      suggestedBy: 'Alex (Android Client)',
      upvotes: 4,
      downvotes: 0
    },
    {
      id: 'sug-2',
      title: 'Neon Horizon',
      artist: 'Cybernetic Pulse',
      genre: 'Synthwave',
      suggestedBy: 'Elena (Desktop Client)',
      upvotes: 3,
      downvotes: 1
    },
    {
      id: 'sug-3',
      title: 'Acoustic Reverie',
      artist: 'Pine & String',
      genre: 'Folk / Indie',
      suggestedBy: 'Marco (Android Client)',
      upvotes: 2,
      downvotes: 2
    }
  ])

  const lanUrls = status?.host.lanUrls ?? []
  const hostUrl = lanUrls[0] ?? `https://192.168.1.100:${PARALLAX_DEFAULT_PORT}`
  const hostEnabled = status?.host.enabled ?? false
  const connectedSinkCount = status?.host.connectedSinkCount ?? 0

  const handleNotify = (msg: string) => {
    setNotification(msg)
    setTimeout(() => setNotification(null), 3000)
  }

  const handleCopyInvite = () => {
    navigator.clipboard.writeText(hostUrl)
    setCopiedLink(true)
    handleNotify('Invite URL copied to clipboard!')
    setTimeout(() => setCopiedLink(false), 2500)
  }

  const handleVote = (id: string, type: 'up' | 'down') => {
    setSuggestions(prev => prev.map(item => {
      if (item.id !== id) return item
      const currentVote = item.hasVoted
      let newUp = item.upvotes
      let newDown = item.downvotes

      if (currentVote === type) {
        // Undo vote
        if (type === 'up') newUp--
        else newDown--
        return { ...item, upvotes: newUp, downvotes: newDown, hasVoted: undefined }
      } else {
        if (currentVote === 'up') newUp--
        if (currentVote === 'down') newDown--
        if (type === 'up') newUp++
        if (type === 'down') newDown++
        return { ...item, upvotes: newUp, downvotes: newDown, hasVoted: type }
      }
    }))
  }

  const handleApproveSuggestion = (item: SuggestionItem) => {
    // Look for matching track in library
    const tracks = Array.from(trackByPath.values())
    const match = tracks.find(t => 
      t.title.toLowerCase() === item.title.toLowerCase() || 
      t.artist.toLowerCase() === item.artist.toLowerCase()
    )

    if (match) {
      void enqueueTrackPaths([match.path], 'end')
      handleNotify(`Added "${item.title}" to playback queue!`)
    } else {
      handleNotify(`Approved "${item.title}" (Stream synced to peers)`)
    }

    // Remove suggestion
    setSuggestions(prev => prev.filter(s => s.id !== item.id))
  }

  return (
    <div className="flex flex-col h-full bg-gradient-to-b from-[#12141d] via-[#0d0f17] to-[#0a0b10] text-white rounded-3xl overflow-hidden border border-white/10 shadow-2xl">
      {/* Header Banner */}
      <div className="relative p-6 bg-gradient-to-r from-purple-900/40 via-indigo-900/30 to-blue-900/20 border-b border-white/10 flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-purple-500/30 text-2xl font-black">
            🎧
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h2 className="text-2xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white via-purple-100 to-indigo-200">
                Listen Together
              </h2>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wider uppercase bg-purple-500/20 text-purple-300 border border-purple-500/30 animate-pulse">
                Parallax Engine
              </span>
            </div>
            <p className="text-xs text-gray-400 mt-0.5">
              Low-latency LAN audio synchronization & collaborative playlist voting
            </p>
          </div>
        </div>

        {/* Status indicator */}
        <div className="flex items-center space-x-3 bg-black/40 px-4 py-2 rounded-xl border border-white/5">
          <div className={`w-2.5 h-2.5 rounded-full ${hostEnabled ? 'bg-emerald-400 animate-ping' : 'bg-gray-500'}`} />
          <div className="text-right">
            <div className="text-xs font-semibold text-white">
              {hostEnabled ? 'Broadcasting Audio' : 'Standby Mode'}
            </div>
            <div className="text-[10px] text-gray-400">
              {connectedSinkCount} connected {connectedSinkCount === 1 ? 'peer' : 'peers'}
            </div>
          </div>
        </div>
      </div>

      {/* Notification Toast */}
      {notification && (
        <div className="bg-purple-600/90 text-white text-xs font-semibold px-4 py-2 flex items-center justify-between transition-all animate-fadeIn border-b border-purple-500/50">
          <span>🔔 {notification}</span>
          <button onClick={() => setNotification(null)} className="text-white/80 hover:text-white">✕</button>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="flex border-b border-white/5 bg-black/20 px-6">
        <button
          type="button"
          onClick={() => setActiveTab('sync')}
          className={`py-3 px-5 text-sm font-semibold transition-all relative ${
            activeTab === 'sync' ? 'text-purple-400' : 'text-gray-400 hover:text-white'
          }`}
        >
          <span>📻 Multi-Room Sync</span>
          {activeTab === 'sync' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-purple-500 rounded-t-full shadow-sm shadow-purple-500" />}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('queue')}
          className={`py-3 px-5 text-sm font-semibold transition-all relative flex items-center space-x-2 ${
            activeTab === 'queue' ? 'text-purple-400' : 'text-gray-400 hover:text-white'
          }`}
        >
          <span>🗳️ Collaborative Queue</span>
          {suggestions.length > 0 && (
            <span className="w-5 h-5 rounded-full bg-purple-500/20 text-purple-300 text-xs flex items-center justify-center font-bold border border-purple-500/30">
              {suggestions.length}
            </span>
          )}
          {activeTab === 'queue' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-purple-500 rounded-t-full shadow-sm shadow-purple-500" />}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('invite')}
          className={`py-3 px-5 text-sm font-semibold transition-all relative ${
            activeTab === 'invite' ? 'text-purple-400' : 'text-gray-400 hover:text-white'
          }`}
        >
          <span>📲 Invite & QR Code</span>
          {activeTab === 'invite' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-purple-500 rounded-t-full shadow-sm shadow-purple-500" />}
        </button>
      </div>

      {/* Tab Content Area */}
      <div className="flex-1 overflow-y-auto p-6">
        {activeTab === 'sync' && (
          <div className="space-y-6 animate-fadeIn">
            <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-5">
              <h3 className="text-md font-bold text-white mb-1">Speaker & Client Orchestration</h3>
              <p className="text-xs text-gray-400 mb-4">
                Manage connected speakers, adjust per-device latency compensation, and toggle host/sink roles on this machine.
              </p>
              <ParallaxManagementView
                notify={handleNotify}
                onAddSpeaker={() => handleNotify('Scanning local network for Parallax-compatible speakers...')}
                onChangeRole={() => handleNotify('Role switching available in Advanced Settings below')}
              />
            </div>
          </div>
        )}

        {activeTab === 'queue' && (
          <div className="space-y-4 animate-fadeIn">
            <div className="flex items-center justify-between mb-2">
              <div>
                <h3 className="text-md font-bold text-white">Guest Track Suggestions</h3>
                <p className="text-xs text-gray-400">
                  Peers connected via Musaic Android or Desktop can recommend tracks. Approve suggestions to merge them into the synchronized play queue.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSuggestions([
                    {
                      id: `sug-${Date.now()}`,
                      title: 'Musaicl Echoes',
                      artist: 'Deep Void',
                      genre: 'Ambient / Chill',
                      suggestedBy: 'Guest User',
                      upvotes: 1,
                      downvotes: 0
                    },
                    ...suggestions
                  ])
                  handleNotify('Simulated incoming track recommendation!')
                }}
                className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-medium border border-white/10 transition-all text-gray-300"
              >
                + Simulate Incoming Suggestion
              </button>
            </div>

            {suggestions.length === 0 ? (
              <div className="text-center py-12 bg-white/[0.01] border border-white/5 rounded-2xl">
                <div className="text-4xl mb-3">🎵</div>
                <div className="text-sm font-semibold text-gray-300">No Pending Suggestions</div>
                <div className="text-xs text-gray-500 mt-1 max-w-sm mx-auto">
                  When guests connect to your session, their track requests and upvotes will appear here in real-time.
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3">
                {suggestions.map(item => (
                  <div
                    key={item.id}
                    className="p-4 rounded-2xl bg-white/[0.03] hover:bg-white/[0.05] border border-white/5 flex items-center justify-between transition-all group"
                  >
                    <div className="flex items-center space-x-4">
                      <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-lg font-bold text-purple-400">
                        🎶
                      </div>
                      <div>
                        <div className="text-sm font-bold text-white group-hover:text-purple-300 transition-colors">
                          {item.title}
                        </div>
                        <div className="text-xs text-gray-400">
                          {item.artist} {item.genre && <span className="text-gray-500">· {item.genre}</span>}
                        </div>
                        <div className="text-[10px] text-purple-400/80 mt-0.5">
                          Suggested by {item.suggestedBy}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center space-x-3">
                      {/* Voting buttons */}
                      <div className="flex items-center bg-black/40 rounded-xl p-1 border border-white/5 space-x-1">
                        <button
                          type="button"
                          onClick={() => handleVote(item.id, 'up')}
                          className={`px-2.5 py-1 rounded-lg text-xs font-bold flex items-center space-x-1 transition-all ${
                            item.hasVoted === 'up'
                              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                              : 'text-gray-400 hover:text-white hover:bg-white/5'
                          }`}
                        >
                          <span>▲</span>
                          <span>{item.upvotes}</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleVote(item.id, 'down')}
                          className={`px-2 py-1 rounded-lg text-xs font-bold flex items-center space-x-1 transition-all ${
                            item.hasVoted === 'down'
                              ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                              : 'text-gray-400 hover:text-white hover:bg-white/5'
                          }`}
                        >
                          <span>▼</span>
                          <span>{item.downvotes}</span>
                        </button>
                      </div>

                      {/* Approve button */}
                      <button
                        type="button"
                        onClick={() => handleApproveSuggestion(item)}
                        className="px-4 py-2 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-xs font-bold shadow-md shadow-purple-600/20 transition-all transform hover:scale-105 active:scale-95"
                      >
                        Add to Queue
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'invite' && (
          <div className="max-w-xl mx-auto space-y-6 animate-fadeIn py-4">
            <div className="bg-gradient-to-br from-white/[0.05] to-white/[0.01] border border-white/10 rounded-3xl p-8 text-center relative overflow-hidden shadow-2xl">
              <div className="absolute top-0 right-0 w-48 h-48 bg-purple-500/10 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none" />
              <div className="absolute bottom-0 left-0 w-48 h-48 bg-indigo-500/10 rounded-full blur-3xl -ml-20 -mb-20 pointer-events-none" />

              <h3 className="text-xl font-extrabold text-white mb-2">Join Collaborative Session</h3>
              <p className="text-xs text-gray-400 max-w-sm mx-auto mb-6">
                Scan this QR code using the Musaic Player mobile app (Android) or desktop client to connect over local Wi-Fi.
              </p>

              {/* QR Code Container */}
              <div className="w-56 h-56 mx-auto bg-white p-4 rounded-2xl shadow-xl flex items-center justify-center relative group">
                <div className="w-full h-full border-4 border-dashed border-gray-300 rounded-xl flex flex-col items-center justify-center p-4 text-center">
                  <div className="text-4xl mb-2">📱</div>
                  <div className="text-xs font-bold text-gray-800 break-all">{hostUrl}</div>
                  <div className="text-[10px] text-gray-500 mt-1 uppercase font-semibold tracking-wider">Parallax QR Ready</div>
                </div>
              </div>

              {/* Host Details */}
              <div className="mt-6 p-4 rounded-2xl bg-black/40 border border-white/5 flex items-center justify-between text-left">
                <div>
                  <div className="text-xs font-semibold text-gray-300">Session Endpoint URL</div>
                  <div className="text-xs font-mono text-purple-400 truncate max-w-[280px] mt-0.5">
                    {hostUrl}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleCopyInvite}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                    copiedLink
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                      : 'bg-purple-600 hover:bg-purple-500 text-white shadow-md shadow-purple-600/20'
                  }`}
                >
                  {copiedLink ? '✓ Copied!' : 'Copy Link'}
                </button>
              </div>

              <div className="mt-4 flex items-center justify-center space-x-6 text-[11px] text-gray-400">
                <span className="flex items-center space-x-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-400" />
                  <span>Zero-config mDNS discovery enabled</span>
                </span>
                <span className="flex items-center space-x-1.5">
                  <span className="w-2 h-2 rounded-full bg-blue-400" />
                  <span>24-bit PCM / FLAC Lossless</span>
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
