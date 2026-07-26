import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useLibraryStore, type DbTrack } from '../../stores/libraryStore';
import { usePlayerStore } from '../../stores/playerStore';
import { useAiSettingsStore } from '../../stores/aiSettingsStore';
import {
  NEBULA_CLUSTERS,
  offlineHeuristicMood,
  analyzeTracksMood,
  generateNebulaPlaylist,
  type TrackMood,
} from '../../../shared/library/moodAnalyzer';

export default function MoodNebulaScreen() {
  const { trackByPath, trackPaths } = useLibraryStore();
  const { startPlaybackContextByPaths, enqueueTrackPaths } = usePlayerStore();
  const aiSettings = useAiSettingsStore((state) => state.settings);

  const [moodMap, setMoodMap] = useState<Map<string, TrackMood>>(new Map());
  const [selectedCluster, setSelectedCluster] = useState<string | null>(null);
  const [hoveredTrack, setHoveredTrack] = useState<{ track: DbTrack; mood: TrackMood; x: number; y: number } | null>(null);
  const [targetPoint, setTargetPoint] = useState<{ v: number; e: number } | null>({ v: 0.75, e: 0.6 });
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [generatedPlaylist, setGeneratedPlaylist] = useState<DbTrack[]>([]);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Load heuristic moods initially
  useEffect(() => {
    const map = new Map<string, TrackMood>();
    for (const path of trackPaths) {
      const track = trackByPath.get(path);
      if (track) {
        const mood = offlineHeuristicMood(track.path, track.title, track.genre || undefined, track.artist);
        map.set(track.path, mood);
      }
    }
    setMoodMap(map);
  }, [trackPaths, trackByPath]);

  // Update playlist when target point or moodMap changes
  useEffect(() => {
    if (!targetPoint) return;
    const paths = generateNebulaPlaylist(moodMap, targetPoint.v, targetPoint.e, 20);
    const tracks: DbTrack[] = [];
    for (const p of paths) {
      const t = trackByPath.get(p);
      if (t) tracks.push(t);
    }
    setGeneratedPlaylist(tracks);
  }, [targetPoint, moodMap, trackByPath]);

  const handleRunAiAnalysis = async () => {
    if (isAnalyzing || trackPaths.length === 0) return;
    setIsAnalyzing(true);
    try {
      const batch = trackPaths.slice(0, 50).map((path) => {
        const t = trackByPath.get(path)!;
        return { id: t.path, title: t.title, artist: t.artist, genre: t.genre || undefined };
      });

      const results = await analyzeTracksMood(batch, {
        provider: aiSettings.provider,
        apiKey: aiSettings.apiKey,
        serverUrl: aiSettings.serverUrl,
        model: aiSettings.model,
      });

      const nextMap = new Map(moodMap);
      for (const r of results) {
        nextMap.set(String(r.trackId), r);
      }
      setMoodMap(nextMap);
    } catch (err) {
      console.error('AI Analysis failed:', err);
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Canvas rendering
  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    // Clear background with dark cosmic gradient
    const bgGradient = ctx.createRadialGradient(width / 2, height / 2, 50, width / 2, height / 2, Math.max(width, height) / 1.2);
    bgGradient.addColorStop(0, '#0a0a14');
    bgGradient.addColorStop(0.6, '#05050a');
    bgGradient.addColorStop(1, '#000000');
    ctx.fillStyle = bgGradient;
    ctx.fillRect(0, 0, width, height);

    // Draw grid lines
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
    ctx.lineWidth = 1;
    for (let i = 1; i < 5; i++) {
      const x = (width / 5) * i;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();

      const y = (height / 5) * i;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    // Draw Nebula Clusters (glowing circles)
    for (const cluster of NEBULA_CLUSTERS) {
      if (selectedCluster && selectedCluster !== cluster.id) continue;

      const cx = cluster.centerValence * width;
      const cy = (1 - cluster.centerExcitement) * height; // invert Y for canvas
      const radiusPx = cluster.radius * Math.min(width, height);

      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radiusPx);
      grad.addColorStop(0, cluster.color + '33'); // 20% alpha
      grad.addColorStop(0.6, cluster.color + '11'); // 7% alpha
      grad.addColorStop(1, 'rgba(0, 0, 0, 0)');

      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(cx, cy, radiusPx, 0, Math.PI * 2);
      ctx.fill();

      // Label
      ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
      ctx.font = '600 12px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(cluster.name, cx, cy - radiusPx * 0.4);
    }

    // Draw stars (tracks)
    for (const [, mood] of moodMap.entries()) {
      if (selectedCluster && mood.clusterName !== NEBULA_CLUSTERS.find((c) => c.id === selectedCluster)?.name) {
        continue;
      }

      const x = mood.valence * width;
      const y = (1 - mood.excitement) * height;

      ctx.fillStyle = '#ffffff';
      ctx.shadowColor = '#00d2ff';
      ctx.shadowBlur = 6;
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    // Draw Target Point crosshair
    if (targetPoint) {
      const tx = targetPoint.v * width;
      const ty = (1 - targetPoint.e) * height;

      ctx.strokeStyle = '#ff007a';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(tx, ty, 12, 0, Math.PI * 2);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(tx - 18, ty);
      ctx.lineTo(tx + 18, ty);
      ctx.moveTo(tx, ty - 18);
      ctx.lineTo(tx, ty + 18);
      ctx.stroke();
    }
  }, [moodMap, selectedCluster, targetPoint]);

  useEffect(() => {
    drawCanvas();
  }, [drawCanvas]);

  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const v = mouseX / canvas.width;
    const eCoord = 1 - mouseY / canvas.height;

    // Find nearest track within threshold
    let nearest: { track: DbTrack; mood: TrackMood; dist: number } | null = null;
    for (const [path, mood] of moodMap.entries()) {
      const dist = Math.sqrt(Math.pow(mood.valence - v, 2) + Math.pow(mood.excitement - eCoord, 2));
      if (dist < 0.04) {
        if (!nearest || dist < nearest.dist) {
          const track = trackByPath.get(path);
          if (track) {
            nearest = { track, mood, dist };
          }
        }
      }
    }

    if (nearest) {
      setHoveredTrack({ track: nearest.track, mood: nearest.mood, x: mouseX, y: mouseY });
    } else {
      setHoveredTrack(null);
    }
  };

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const v = Math.max(0.05, Math.min(0.95, mouseX / canvas.width));
    const eCoord = Math.max(0.05, Math.min(0.95, 1 - mouseY / canvas.height));
    setTargetPoint({ v: Math.round(v * 100) / 100, e: Math.round(eCoord * 100) / 100 });
  };

  const handlePlayPlaylist = () => {
    if (!generatedPlaylist.length) return;
    const paths = generatedPlaylist.map((t) => t.path);
    startPlaybackContextByPaths(paths, 0, { contextLabel: 'Nebula Smart Playlist' });
  };

  const handleQueuePlaylist = () => {
    if (!generatedPlaylist.length) return;
    const paths = generatedPlaylist.map((t) => t.path);
    enqueueTrackPaths(paths, 'end');
  };

  return (
    <div className="flex h-full w-full flex-col bg-[#080810] text-white overflow-hidden p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 pb-4 border-b border-white/10">
        <div>
          <h1 className="text-2xl font-bold tracking-tight bg-gradient-to-r from-pink-500 via-purple-400 to-cyan-400 bg-clip-text text-transparent">
            Music Mood Nebula
          </h1>
          <p className="text-sm text-gray-400 mt-1">
            Interactive 2D emotional coordinate space (Valence × Excitement). Click anywhere to generate an instant mood-matched playlist.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleRunAiAnalysis}
            disabled={isAnalyzing || trackPaths.length === 0}
            className="px-4 py-2 rounded-lg bg-gradient-to-r from-purple-600 to-pink-600 font-medium text-sm hover:opacity-90 disabled:opacity-50 transition-all shadow-lg shadow-purple-500/20"
          >
            {isAnalyzing ? 'Analyzing with AI...' : 'AI Deep Mood Scan'}
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex flex-1 gap-6 overflow-hidden">
        {/* Canvas Area */}
        <div className="relative flex-1 bg-black/40 rounded-2xl border border-white/10 overflow-hidden flex items-center justify-center">
          <canvas
            ref={canvasRef}
            width={720}
            height={520}
            onMouseMove={handleCanvasMouseMove}
            onClick={handleCanvasClick}
            className="cursor-crosshair rounded-xl"
          />

          {/* Hover Tooltip */}
          {hoveredTrack && (
            <div
              style={{ left: hoveredTrack.x + 20, top: hoveredTrack.y - 20 }}
              className="absolute z-10 pointer-events-none p-3 rounded-xl bg-black/90 backdrop-blur-md border border-white/20 shadow-2xl max-w-xs"
            >
              <div className="font-semibold text-sm truncate">{hoveredTrack.track.title}</div>
              <div className="text-xs text-gray-400 truncate">{hoveredTrack.track.artist}</div>
              <div className="mt-2 flex items-center gap-2 text-[11px] text-cyan-300 font-mono">
                <span>V: {hoveredTrack.mood.valence}</span>
                <span>•</span>
                <span>E: {hoveredTrack.mood.excitement}</span>
              </div>
              {hoveredTrack.mood.clusterName && (
                <div className="mt-1 text-[10px] text-pink-400 uppercase tracking-wider font-bold">
                  {hoveredTrack.mood.clusterName}
                </div>
              )}
            </div>
          )}

          {/* Axis Labels */}
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 text-[11px] font-medium text-gray-500 uppercase tracking-widest pointer-events-none">
            ← Melancholic / Sad • Valence • Happy / Euphoric →
          </div>
          <div className="absolute left-3 top-1/2 -translate-y-1/2 -rotate-90 text-[11px] font-medium text-gray-500 uppercase tracking-widest pointer-events-none">
            ← Calm / Chill • Energy • Intense / Energetic →
          </div>
        </div>

        {/* Sidebar / Smart Playlist */}
        <div className="w-80 flex flex-col bg-white/[0.02] border border-white/10 rounded-2xl p-4 overflow-hidden">
          <div className="mb-4">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-300">Cluster Filter</h2>
            <div className="flex flex-wrap gap-1.5 mt-2">
              <button
                onClick={() => setSelectedCluster(null)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                  selectedCluster === null ? 'bg-white/20 text-white' : 'bg-white/5 text-gray-400 hover:bg-white/10'
                }`}
              >
                All Clusters
              </button>
              {NEBULA_CLUSTERS.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setSelectedCluster(selectedCluster === c.id ? null : c.id)}
                  style={{ borderColor: selectedCluster === c.id ? c.color : 'transparent' }}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium border transition-all ${
                    selectedCluster === c.id ? 'bg-white/10 text-white' : 'bg-white/5 text-gray-400 hover:bg-white/10'
                  }`}
                >
                  {c.name.split(' ')[0]}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 flex flex-col min-h-0 border-t border-white/10 pt-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h2 className="text-sm font-semibold uppercase tracking-wider text-pink-400">Smart Playlist</h2>
                {targetPoint && (
                  <div className="text-[11px] text-gray-400 font-mono">
                    Target: ({targetPoint.v}, {targetPoint.e})
                  </div>
                )}
              </div>
              <div className="flex gap-1.5">
                <button
                  onClick={handlePlayPlaylist}
                  disabled={!generatedPlaylist.length}
                  className="px-3 py-1.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-black font-bold text-xs transition-all disabled:opacity-50"
                >
                  Play
                </button>
                <button
                  onClick={handleQueuePlaylist}
                  disabled={!generatedPlaylist.length}
                  className="px-2.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white font-medium text-xs transition-all disabled:opacity-50"
                >
                  + Queue
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto space-y-1.5 pr-1 custom-scrollbar">
              {generatedPlaylist.map((track, idx) => (
                <div
                  key={track.path}
                  onClick={() => startPlaybackContextByPaths([track.path], 0)}
                  className="group flex items-center gap-2.5 p-2 rounded-lg bg-white/[0.02] hover:bg-white/[0.08] cursor-pointer transition-all border border-transparent hover:border-white/10"
                >
                  <span className="text-xs font-mono text-gray-500 w-5 text-right">{idx + 1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium text-gray-200 group-hover:text-white truncate">
                      {track.title}
                    </div>
                    <div className="text-[11px] text-gray-400 truncate">{track.artist}</div>
                  </div>
                </div>
              ))}
              {generatedPlaylist.length === 0 && (
                <div className="text-center py-8 text-xs text-gray-500">
                  No tracks found near target point. Try scanning more songs or clicking elsewhere.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
