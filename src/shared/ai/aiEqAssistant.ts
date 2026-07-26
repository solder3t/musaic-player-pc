import { sendAiPrompt, AiRequestOptions } from './aiClient';

export interface GeneratedEqResult {
  name: string;
  preamp: number;
  gains: number[]; // 10 bands corresponding to [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000]
  description: string;
}

export const STANDARD_EQ_FREQUENCIES = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];

const EQ_ASSISTANT_SYSTEM_PROMPT = `You are an expert audio mastering engineer and acoustician for Musaic Player.
Your job is to generate a custom 10-band equalizer curve based on the user's natural language description of desired sound signature, music genre, headphone type, or room acoustic properties.

The 10 standard center frequencies (in Hz) are: 31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000.
Each gain value must be a floating point number between -12.0 and +12.0 (in dB).
Preamp gain must be set to prevent digital clipping (if you boost gains significantly, set preamp to a negative value roughly equal to minus the maximum boost).

You MUST respond ONLY with a valid JSON object matching this exact schema (no markdown code blocks, no trailing comments):
{
  "name": "Short descriptive preset name",
  "preamp": -2.0,
  "gains": [2.0, 3.5, 1.0, 0.0, -1.0, 1.5, 2.5, 1.0, 3.0, 2.0],
  "description": "Brief 1-sentence explanation of what this EQ curve does for the sound."
}`;

/**
 * Offline heuristic EQ generator when AI is disabled, offline, or fails.
 */
export function offlineHeuristicEq(prompt: string): GeneratedEqResult {
  const lower = prompt.toLowerCase();
  const gains = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  let name = 'Custom EQ';
  let desc = 'Balanced acoustic curve generated offline.';

  if (lower.includes('bass') || lower.includes('punch') || lower.includes('sub') || lower.includes('edm') || lower.includes('hiphop') || lower.includes('rap')) {
    gains[0] += 4.5; // 31Hz
    gains[1] += 5.0; // 62Hz
    gains[2] += 3.0; // 125Hz
    name = 'Punchy Bass Boost';
    desc = 'Enhanced sub-bass and low-end impact.';
  }
  if (lower.includes('warm') || lower.includes('vinyl') || lower.includes('cozy') || lower.includes('tube') || lower.includes('jazz') || lower.includes('lofi')) {
    gains[2] += 2.5; // 125Hz
    gains[3] += 2.0; // 250Hz
    gains[4] += 1.0; // 500Hz
    gains[8] -= 1.5; // 8kHz
    gains[9] -= 2.5; // 16kHz
    name = 'Warm Vintage Analog';
    desc = 'Rich lower midrange with smooth rolled-off treble for fatigue-free listening.';
  }
  if (lower.includes('vocal') || lower.includes('podcast') || lower.includes('speech') || lower.includes('acoustic') || lower.includes('clarity') || lower.includes('clear')) {
    gains[1] -= 2.0; // 62Hz
    gains[5] += 3.0; // 1kHz
    gains[6] += 3.5; // 2kHz
    gains[7] += 2.5; // 4kHz
    name = 'Vocal & Mid Presence';
    desc = 'Highlighted human voice frequencies and acoustic guitar articulation.';
  }
  if (lower.includes('bright') || lower.includes('air') || lower.includes('detail') || lower.includes('sparkle') || lower.includes('treble') || lower.includes('classical')) {
    gains[7] += 2.0; // 4kHz
    gains[8] += 3.5; // 8kHz
    gains[9] += 4.5; // 16kHz
    name = 'Air & High Detail';
    desc = 'Crystal clear treble extension and harmonic shimmer.';
  }
  if (lower.includes('rock') || lower.includes('metal') || lower.includes('guitar') || lower.includes('v-shape')) {
    gains[0] += 3.5; gains[1] += 3.0; gains[2] += 1.5;
    gains[4] -= 2.0; gains[5] -= 1.5;
    gains[7] += 2.5; gains[8] += 3.5; gains[9] += 3.0;
    name = 'Dynamic V-Shape';
    desc = 'High-energy rock and metal profile with powerful bass and crisp cymbals.';
  }

  // Calculate preamp to avoid clipping
  const maxBoost = Math.max(...gains, 0);
  const preamp = maxBoost > 0 ? -Math.round(maxBoost * 10) / 10 : 0;

  return { name, preamp, gains, description: desc };
}

/**
 * Generates a 10-band EQ curve from a natural language prompt using AI.
 */
export async function generateEqFromPrompt(
  userPrompt: string,
  options: AiRequestOptions
): Promise<GeneratedEqResult> {
  if (!userPrompt || !userPrompt.trim()) {
    return offlineHeuristicEq('balanced');
  }

  if (options.provider === 'none' || (!options.apiKey && options.provider !== 'ollama')) {
    return offlineHeuristicEq(userPrompt);
  }

  try {
    const res = await sendAiPrompt(
      EQ_ASSISTANT_SYSTEM_PROMPT,
      `User request: "${userPrompt}"`,
      options
    );

    if (res.error || !res.text) {
      console.warn('[AiEqAssistant] AI request returned error/empty, falling back:', res.error);
      return offlineHeuristicEq(userPrompt);
    }

    // Parse JSON
    let jsonStr = res.text.trim();
    if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/^```[a-z]*\n?/mi, '').replace(/\n?```$/m, '').trim();
    }

    const parsed = JSON.parse(jsonStr);
    if (
      typeof parsed === 'object' &&
      Array.isArray(parsed.gains) &&
      parsed.gains.length === 10
    ) {
      const gains = parsed.gains.map((g: any) => {
        const num = Number(g);
        return isNaN(num) ? 0 : Math.max(-12, Math.min(12, Math.round(num * 10) / 10));
      });
      const preamp = typeof parsed.preamp === 'number' ? Math.max(-12, Math.min(12, parsed.preamp)) : 0;
      const name = parsed.name ? String(parsed.name).slice(0, 32) : 'AI Generated EQ';
      const description = parsed.description ? String(parsed.description) : `Custom EQ for: ${userPrompt}`;
      return { name, preamp, gains, description };
    }
  } catch (err) {
    console.warn('[AiEqAssistant] Failed to generate/parse AI EQ, using fallback heuristic:', err);
  }

  return offlineHeuristicEq(userPrompt);
}
