import { sendAiPrompt, AiRequestOptions } from '../ai/aiClient';

export interface TrackMood {
  trackId: string | number;
  valence: number;   // 0.0 (sad/dark/melancholic) to 1.0 (happy/bright/euphoric)
  excitement: number; // 0.0 (calm/chill/sleepy) to 1.0 (intense/energetic/aggressive)
  clusterName?: string;
}

export interface MoodCluster {
  id: string;
  name: string;
  color: string;
  centerValence: number;
  centerExcitement: number;
  radius: number;
  description: string;
}

export const NEBULA_CLUSTERS: MoodCluster[] = [
  {
    id: 'euphoric',
    name: 'Solar Flare Euphoria',
    color: '#FF007A',
    centerValence: 0.85,
    centerExcitement: 0.85,
    radius: 0.35,
    description: 'High-energy, upbeat, and celebratory tracks that ignite the mood.'
  },
  {
    id: 'chill',
    name: 'Lunar Calm & Chill',
    color: '#00D2FF',
    centerValence: 0.75,
    centerExcitement: 0.25,
    radius: 0.35,
    description: 'Relaxed, peaceful, and warm acoustic or lofi vibes for focusing.'
  },
  {
    id: 'melancholy',
    name: 'Midnight Melancholy',
    color: '#4A00E0',
    centerValence: 0.2,
    centerExcitement: 0.2,
    radius: 0.35,
    description: 'Deep, emotional, sad, or contemplative ballads and ambient music.'
  },
  {
    id: 'intense',
    name: 'Supernova Intensity',
    color: '#FF4D00',
    centerValence: 0.3,
    centerExcitement: 0.85,
    radius: 0.35,
    description: 'Aggressive, heavy, or intense rock, metal, or high-tempo electronic.'
  },
  {
    id: 'mystic',
    name: 'Cosmic Drift',
    color: '#8A2BE2',
    centerValence: 0.5,
    centerExcitement: 0.5,
    radius: 0.3,
    description: 'Balanced, hypnotic, or atmospheric soundscapes.'
  }
];

const MOOD_SYSTEM_PROMPT = `You are a musicology expert for Musaic Player. Analyze the emotional mood of the provided songs based on Title, Artist, and Genre.
For each song, provide:
- "v": A float from 0.0 (sad, dark, negative) to 1.0 (happy, bright, positive).
- "e": A float from 0.0 (calm, sleepy, chill) to 1.0 (intense, energetic, aggressive).

Return ONLY a strict JSON array of objects with keys: "id", "v", "e".
Example: [{"id": "track-1", "v": 0.8, "e": 0.7}]`;

/**
 * Analyze a single track's mood offline or via heuristic.
 */
export function analyzeMood(track: { id: string | number; title: string; genre?: string | null; artist?: string | null }): TrackMood {
  return offlineHeuristicMood(track.id, track.title, track.genre, track.artist);
}

/**
 * Offline heuristic mood estimation from metadata when offline or AI is disabled.
 */
export function offlineHeuristicMood(
  trackId: string | number,
  title: string,
  genre?: string | null,
  artist?: string | null
): TrackMood {
  let v = 0.5;
  let e = 0.5;
  const text = `${title} ${genre || ''} ${artist || ''}`.toLowerCase();

  // Basic keyword valence matching
  if (/happy|joy|bright|love|sun|summer|dance|party|upbeat|celebrate/i.test(text)) v += 0.3;
  if (/sad|cry|dark|pain|lonely|winter|broken|rain|sorrow|grief/i.test(text)) v -= 0.3;
  if (/minor|slow|melancholy/i.test(text)) v -= 0.15;
  if (/major|fast|pop|disco/i.test(text)) v += 0.15;

  // Basic keyword excitement matching
  if (/fast|rock|metal|techno|edm|intense|energy|power|wild|heavy/i.test(text)) e += 0.35;
  if (/slow|calm|chill|sleep|ambient|lofi|acoustic|piano|relax|soft/i.test(text)) e -= 0.35;
  if (/jazz|classical/i.test(text)) e -= 0.15;

  v = Math.max(0.05, Math.min(0.95, v));
  e = Math.max(0.05, Math.min(0.95, e));

  const cluster = getNearestCluster(v, e);
  return {
    trackId,
    valence: Number(v.toFixed(2)),
    excitement: Number(e.toFixed(2)),
    clusterName: cluster.name
  };
}

/**
 * Find the nearest mood cluster.
 */
export function getNearestCluster(valence: number, excitement: number): MoodCluster {
  let bestCluster = NEBULA_CLUSTERS[0];
  let minDist = Infinity;

  for (const cluster of NEBULA_CLUSTERS) {
    const dist = Math.hypot(valence - cluster.centerValence, excitement - cluster.centerExcitement);
    if (dist < minDist) {
      minDist = dist;
      bestCluster = cluster;
    }
  }

  return bestCluster;
}

/**
 * Analyzes a batch of tracks using AI or offline fallback.
 */
export async function analyzeTracksMood(
  tracks: Array<{ id: string | number; title: string; artist: string | null; genre?: string | null }>,
  options: AiRequestOptions
): Promise<TrackMood[]> {
  if (!tracks.length) return [];

  if (options.provider === 'none' || (!options.apiKey && options.provider !== 'ollama')) {
    return tracks.map(t => offlineHeuristicMood(t.id, t.title, t.genre, t.artist));
  }

  const userPrompt = tracks.map(t => `- [ID: "${t.id}"] "${t.title}" by "${t.artist || 'Unknown'}" [Genre: ${t.genre || 'Unknown'}]`).join('\n');

  try {
    const res = await sendAiPrompt(MOOD_SYSTEM_PROMPT, `Analyze these songs:\n${userPrompt}`, options);
    if (res.error || !res.text) {
      return tracks.map(t => offlineHeuristicMood(t.id, t.title, t.genre, t.artist));
    }

    let jsonStr = res.text.trim();
    if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/^```[a-z]*\n?/mi, '').replace(/\n?```$/m, '').trim();
    }

    const parsed = JSON.parse(jsonStr);
    if (Array.isArray(parsed)) {
      const resultsMap = new Map<string, { v: number; e: number }>();
      for (const item of parsed) {
        if (item?.id && typeof item.v === 'number' && typeof item.e === 'number') {
          resultsMap.set(String(item.id), {
            v: Math.max(0, Math.min(1, item.v)),
            e: Math.max(0, Math.min(1, item.e))
          });
        }
      }

      return tracks.map(t => {
        const found = resultsMap.get(String(t.id));
        if (found) {
          return {
            trackId: t.id,
            valence: found.v,
            excitement: found.e,
            clusterName: getNearestCluster(found.v, found.e).name
          };
        }
        return offlineHeuristicMood(t.id, t.title, t.genre, t.artist);
      });
    }
  } catch (err) {
    console.warn('[MoodAnalyzer] AI batch mood failed, using fallback:', err);
  }

  return tracks.map(t => offlineHeuristicMood(t.id, t.title, t.genre, t.artist));
}

/**
 * Generates a Smart Playlist by finding tracks closest to a target valence/excitement coordinate.
 */
export function generateNebulaPlaylist(
  allTrackMoods: Map<string, TrackMood>,
  targetValence: number,
  targetExcitement: number,
  limit: number = 25
): string[] {
  const scored = Array.from(allTrackMoods.values()).map(m => {
    const dist = Math.sqrt(
      Math.pow(m.valence - targetValence, 2) + Math.pow(m.excitement - targetExcitement, 2)
    );
    return { trackId: m.trackId, dist };
  });

  scored.sort((a, b) => a.dist - b.dist);
  return scored.slice(0, limit).map(s => String(s.trackId));
}
