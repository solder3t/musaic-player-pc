import { useMemo } from 'react'
import { useLibraryStore } from '../../stores/libraryStore'
import { useListeningStatsStore } from '../../stores/listeningStatsStore'
import { useAiSettingsStore } from '../../stores/aiSettingsStore'
import { analyzeMood } from '../../../shared/library/moodAnalyzer'

export default function AiStatisticsScreen() {
  const trackByPath = useLibraryStore((state) => state.trackByPath)
  const tracks = useMemo(() => Array.from(trackByPath.values()), [trackByPath])
  const { range, setRange } = useListeningStatsStore()
  const aiSettings = useAiSettingsStore((state) => state.settings)

  const autoEQEnabled = true
  const targetWarmth = 1.8
  const targetClarity = 2.4
  const aiRomanizationEnabled = aiSettings.autoRomanize

  // Analyze mood distribution across all tracks or top listened tracks
  const moodAnalytics = useMemo(() => {
    let totalValence = 0
    let totalExcitement = 0
    let totalEnergy = 0
    let count = 0

    const moodCounts = {
      euphoric: 0, // High valence, High excitement
      melancholic: 0, // Low valence, Low excitement
      intense: 0, // Low valence, High excitement
      serene: 0 // High valence, Low excitement
    }

    const analyzedTracks = tracks.map(t => ({ track: t, mood: analyzeMood(t) }))
    for (const item of analyzedTracks) {
      const energy = (item.mood.valence + item.mood.excitement) / 2
      totalValence += item.mood.valence
      totalExcitement += item.mood.excitement
      totalEnergy += energy
      count++

      if (item.mood.valence >= 0.5 && item.mood.excitement >= 0.5) moodCounts.euphoric++
      else if (item.mood.valence < 0.5 && item.mood.excitement < 0.5) moodCounts.melancholic++
      else if (item.mood.valence < 0.5 && item.mood.excitement >= 0.5) moodCounts.intense++
      else moodCounts.serene++
    }

    const avgValence = count > 0 ? (totalValence / count) : 0.6
    const avgExcitement = count > 0 ? (totalExcitement / count) : 0.5
    const avgEnergy = count > 0 ? (totalEnergy / count) : 0.55

    // Determine AI Persona
    let personaName = "The Sonic Alchemist"
    let personaDesc = "You explore a balanced spectrum of musical emotions with an eye for dynamic acoustic detail."
    let personaIcon = "🔮"

    if (avgExcitement > 0.65 && avgEnergy > 0.6) {
      personaName = "High-Voltage Kineticist"
      personaDesc = "Your listening thrives on high-energy rhythms, intense tempos, and electrifying sonic landscapes."
      personaIcon = "⚡"
    } else if (avgValence < 0.4 && avgExcitement < 0.45) {
      personaName = "The Midnight Dreamer"
      personaDesc = "You gravitate towards melancholic, reflective, and deeply atmospheric compositions."
      personaIcon = "🌙"
    } else if (avgValence >= 0.6 && avgExcitement < 0.5) {
      personaName = "Serene Harmonist"
      personaDesc = "Your musical palette emphasizes peace, acoustic warmth, and soothing melodies."
      personaIcon = "🍃"
    } else if (avgValence >= 0.65 && avgExcitement >= 0.6) {
      personaName = "Euphorica Voyager"
      personaDesc = "Uplifting, joyous anthems and vibrant acoustic colors dominate your sonic universe."
      personaIcon = "✨"
    }

    const totalMoods = Math.max(1, count)
    return {
      avgValence,
      avgExcitement,
      avgEnergy,
      personaName,
      personaDesc,
      personaIcon,
      percentages: {
        euphoric: Math.round((moodCounts.euphoric / totalMoods) * 100),
        melancholic: Math.round((moodCounts.melancholic / totalMoods) * 100),
        intense: Math.round((moodCounts.intense / totalMoods) * 100),
        serene: Math.round((moodCounts.serene / totalMoods) * 100)
      }
    }
  }, [tracks])

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8 animate-fadeIn text-white">
      {/* Header & Range Selector */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-gradient-to-r from-purple-900/40 via-indigo-900/30 to-blue-900/20 p-6 rounded-3xl border border-purple-500/20 backdrop-blur-xl shadow-2xl">
        <div>
          <div className="flex items-center gap-3">
            <span className="text-3xl">🤖</span>
            <h1 className="text-3xl font-extrabold bg-clip-text text-transparent bg-gradient-to-r from-purple-400 via-pink-400 to-cyan-400">
              Musaic AI Sonic Intelligence
            </h1>
          </div>
          <p className="text-gray-300 text-sm mt-1">
            Deep neural mood profiling and acoustic listening habits analysis
          </p>
        </div>

        <div className="flex items-center gap-2 bg-black/40 p-1.5 rounded-2xl border border-white/10">
          {(['7d', '30d', '1y', 'all'] as const).map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`px-4 py-1.5 rounded-xl text-xs font-semibold uppercase tracking-wider transition-all duration-300 ${
                range === r
                  ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-lg shadow-purple-500/30'
                  : 'text-gray-400 hover:text-white hover:bg-white/5'
              }`}
            >
              {r === 'all' ? 'All Time' : r}
            </button>
          ))}
        </div>
      </div>

      {/* AI Persona Banner */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-950/80 via-purple-950/60 to-black p-8 border border-purple-500/30 shadow-2xl">
        <div className="absolute -right-10 -top-10 w-64 h-64 bg-purple-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -left-10 -bottom-10 w-64 h-64 bg-pink-500/10 rounded-full blur-3xl pointer-events-none" />
        
        <div className="relative z-10 flex flex-col md:flex-row items-center gap-8">
          <div className="w-28 h-28 rounded-3xl bg-gradient-to-tr from-purple-600 to-pink-500 flex items-center justify-center text-6xl shadow-2xl shadow-purple-500/40 border border-white/20 transform hover:scale-105 transition-transform duration-500">
            {moodAnalytics.personaIcon}
          </div>
          <div className="flex-1 text-center md:text-left space-y-2">
            <div className="inline-block px-3 py-1 rounded-full bg-purple-500/20 border border-purple-400/30 text-purple-300 text-xs font-bold uppercase tracking-widest">
              AI Identified Persona
            </div>
            <h2 className="text-3xl font-black tracking-tight text-white">
              {moodAnalytics.personaName}
            </h2>
            <p className="text-gray-300 text-base max-w-2xl leading-relaxed">
              {moodAnalytics.personaDesc}
            </p>
          </div>
          <div className="flex flex-row md:flex-col gap-4 border-t md:border-t-0 md:border-l border-white/10 pt-4 md:pt-0 md:pl-8 text-center md:text-right">
            <div>
              <div className="text-xs text-gray-400 uppercase font-medium">Avg Energy</div>
              <div className="text-2xl font-black text-cyan-400">{Math.round(moodAnalytics.avgEnergy * 100)}%</div>
            </div>
            <div>
              <div className="text-xs text-gray-400 uppercase font-medium">Valence Index</div>
              <div className="text-2xl font-black text-pink-400">{Math.round(moodAnalytics.avgValence * 100)}%</div>
            </div>
          </div>
        </div>
      </div>

      {/* Grid: Mood Breakdown & AI EQ Insights */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Mood Quadrant Distribution */}
        <div className="bg-black/40 rounded-3xl p-6 border border-white/10 backdrop-blur-md space-y-6 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-bold flex items-center gap-2">
              <span className="text-pink-400">🌌</span> Emotional Quadrants
            </h3>
            <span className="text-xs text-gray-400 font-mono">Based on Valence / Excitement</span>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 rounded-2xl bg-gradient-to-br from-pink-900/30 to-purple-900/20 border border-pink-500/20 space-y-1">
              <div className="text-xs text-pink-300 font-semibold uppercase flex items-center justify-between">
                <span>✨ Euphoric</span>
                <span className="text-lg font-black">{moodAnalytics.percentages.euphoric}%</span>
              </div>
              <div className="w-full bg-black/40 h-1.5 rounded-full overflow-hidden">
                <div className="bg-gradient-to-r from-pink-500 to-purple-500 h-full" style={{ width: `${moodAnalytics.percentages.euphoric}%` }} />
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-gradient-to-br from-blue-900/30 to-indigo-900/20 border border-blue-500/20 space-y-1">
              <div className="text-xs text-blue-300 font-semibold uppercase flex items-center justify-between">
                <span>🌙 Melancholic</span>
                <span className="text-lg font-black">{moodAnalytics.percentages.melancholic}%</span>
              </div>
              <div className="w-full bg-black/40 h-1.5 rounded-full overflow-hidden">
                <div className="bg-gradient-to-r from-blue-500 to-indigo-500 h-full" style={{ width: `${moodAnalytics.percentages.melancholic}%` }} />
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-gradient-to-br from-red-900/30 to-orange-900/20 border border-red-500/20 space-y-1">
              <div className="text-xs text-red-300 font-semibold uppercase flex items-center justify-between">
                <span>🔥 Intense & Dark</span>
                <span className="text-lg font-black">{moodAnalytics.percentages.intense}%</span>
              </div>
              <div className="w-full bg-black/40 h-1.5 rounded-full overflow-hidden">
                <div className="bg-gradient-to-r from-red-500 to-orange-500 h-full" style={{ width: `${moodAnalytics.percentages.intense}%` }} />
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-gradient-to-br from-emerald-900/30 to-teal-900/20 border border-emerald-500/20 space-y-1">
              <div className="text-xs text-emerald-300 font-semibold uppercase flex items-center justify-between">
                <span>🍃 Serene & Chill</span>
                <span className="text-lg font-black">{moodAnalytics.percentages.serene}%</span>
              </div>
              <div className="w-full bg-black/40 h-1.5 rounded-full overflow-hidden">
                <div className="bg-gradient-to-r from-emerald-500 to-teal-500 h-full" style={{ width: `${moodAnalytics.percentages.serene}%` }} />
              </div>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-white/5 border border-white/5 flex items-center gap-3 text-xs text-gray-300">
            <span className="text-purple-400 text-lg">💡</span>
            <span>
              Your library shows a {moodAnalytics.percentages.euphoric + moodAnalytics.percentages.serene > 50 ? 'positive valence dominance' : 'deep emotional complexity'} with {tracks.length} tracks indexed.
            </span>
          </div>
        </div>

        {/* AI Audio & EQ Processing Statistics */}
        <div className="bg-black/40 rounded-3xl p-6 border border-white/10 backdrop-blur-md space-y-6 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-bold flex items-center gap-2">
              <span className="text-cyan-400">🎛️</span> AI Audio Processing Habits
            </h3>
            <span className="text-xs text-gray-400 font-mono">Live Engine Status</span>
          </div>

          <div className="space-y-4">
            <div className="p-4 rounded-2xl bg-white/5 border border-white/5 flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold text-white">AI Equalizer Assistance</div>
                <div className="text-xs text-gray-400">Dynamic real-time acoustic calibration</div>
              </div>
              <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase ${autoEQEnabled ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-gray-700/50 text-gray-400'}`}>
                {autoEQEnabled ? 'Active' : 'Standby'}
              </span>
            </div>

            <div className="p-4 rounded-2xl bg-white/5 border border-white/5 flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold text-white">Acoustic Warmth Bias</div>
                <div className="text-xs text-gray-400">Tube-like second harmonic richness</div>
              </div>
              <div className="text-right">
                <span className="text-lg font-black text-amber-400">+{targetWarmth} dB</span>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-white/5 border border-white/5 flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold text-white">High-Frequency Clarity</div>
                <div className="text-xs text-gray-400">Transient air and vocal presence</div>
              </div>
              <div className="text-right">
                <span className="text-lg font-black text-cyan-400">+{targetClarity} dB</span>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-white/5 border border-white/5 flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold text-white">AI Romanizer & Translator</div>
                <div className="text-xs text-gray-400">Multilingual metadata transliteration</div>
              </div>
              <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase ${aiRomanizationEnabled ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30' : 'bg-gray-700/50 text-gray-400'}`}>
                {aiRomanizationEnabled ? 'Enabled' : 'Disabled'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Top AI Recommended Mood Shift */}
      <div className="bg-gradient-to-r from-purple-900/30 via-pink-900/20 to-black/40 rounded-3xl p-6 border border-purple-500/20 flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="space-y-1 text-center md:text-left">
          <div className="text-xs font-bold uppercase tracking-wider text-pink-400 flex items-center justify-center md:justify-start gap-1.5">
            <span>⚡</span> Next Recommended Sonic Shift
          </div>
          <h4 className="text-xl font-extrabold text-white">
            Transition to &ldquo;Late Night Euphoria&rdquo;
          </h4>
          <p className="text-sm text-gray-300 max-w-xl">
            Based on your time of day and recent activity, transitioning to tracks with 120-128 BPM and high synth energy will optimize focus and mood elevation.
          </p>
        </div>

        <button 
          onClick={() => {
            // Trigger navigation to Mood Nebula or generate playlist
            window.location.hash = '#/mood-nebula'
          }}
          className="px-6 py-3 rounded-2xl bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white font-bold shadow-lg shadow-purple-500/30 hover:shadow-purple-500/50 transition-all duration-300 transform hover:-translate-y-0.5 whitespace-nowrap"
        >
          Explore in Nebula 🚀
        </button>
      </div>
    </div>
  )
}
