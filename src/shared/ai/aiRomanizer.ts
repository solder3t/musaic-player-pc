import { sendAiPrompt, type AiRequestOptions } from './aiClient.ts';

export interface SyncedLyricsLineInput {
  timestampMs: number;
  text: string;
  kind?: 'silence' | 'lyric';
  voice?: string | null;
  [key: string]: unknown;
}

export interface SyncedConversionResult {
  text: string;
  syncedLyrics: string;
  plainLyrics: string;
  syncedLines: SyncedLyricsLineInput[];
  tokens: number;
  fromCache: boolean;
}

const ROMANIZE_SYSTEM_PROMPT = `You are an expert lyrics romanization tool for audiophiles. Convert each line of lyrics from its original non-Latin script (Japanese, Chinese, Korean, Cyrillic, Hindi, Urdu, Arabic, Bengali, Tamil, Telugu, etc.) into readable Latin/Roman script (romanization/Pinyin/Romaji/Romaja).

Rules:
1. Preserve every line break exactly as given.
2. If a line contains LRC timestamps like [00:12.34], keep them unchanged at the absolute start of the line.
3. Lines that are already in Latin script or instrumental tags (like [Instrumental]) must be returned unchanged.
4. Do NOT add translations, explanations, or any extra conversational text.
5. Return ONLY the romanized lyrics text, nothing else.`;

const ROMANIZE_LINES_SYSTEM_PROMPT = `You are an expert lyrics romanization tool for audiophiles. You will receive a numbered list of lyric lines from non-Latin scripts (Japanese, Chinese, Korean, Cyrillic, Hindi, Urdu, Arabic, etc.).
Convert each line into readable Latin/Roman script (Pinyin/Romaji/Romaja/transliteration).

Rules:
1. Return EXACTLY the same number of lines with identical numbering: "1. <romanized line>", "2. <romanized line>", etc.
2. Lines already in Latin script or instrumental indicators must remain unchanged.
3. Do NOT add translations, explanations, notes, or headers.
4. Return ONLY the numbered romanized lines.`;

const TRANSLATE_SYSTEM_PROMPT = (targetLang: string) => `You are an expert music lyrics translator. Translate each line of lyrics into ${targetLang} while keeping the poetic flow, rhythm, and emotional nuance intact.

Rules:
1. Preserve every line break exactly as given.
2. If a line contains LRC timestamps like [00:12.34], keep them unchanged at the absolute start of the line.
3. Do NOT add notes, explanations, or any extra conversational text.
4. Return ONLY the translated lyrics text, nothing else.`;

const TRANSLATE_LINES_SYSTEM_PROMPT = (targetLang: string) => `You are an expert music lyrics translator. You will receive a numbered list of lyric lines. Translate each line into ${targetLang} while preserving the emotional tone and poetic rhythm.

Rules:
1. Return EXACTLY the same number of lines with identical numbering: "1. <translated line>", "2. <translated line>", etc.
2. Do NOT add notes, explanations, or conversational text.
3. Return ONLY the numbered translated lines.`;

const CACHE_LIMIT = 50;
const romanizeCache = new Map<string, string>();
const translateCache = new Map<string, string>();

/**
 * Formats milliseconds as a standard LRC timestamp string: [mm:ss.xx]
 */
export function formatLrcTimestamp(timestampMs: number): string {
  const safeMs = Math.max(0, Math.floor(timestampMs));
  const totalSeconds = Math.floor(safeMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const hundredths = Math.floor((safeMs % 1000) / 10);

  const mm = minutes.toString().padStart(2, '0');
  const ss = seconds.toString().padStart(2, '0');
  const xx = hundredths.toString().padStart(2, '0');
  return `[${mm}:${ss}.${xx}]`;
}

/**
 * Checks if text contains non-Latin characters (CJK, Cyrillic, Arabic, Devanagari, etc.)
 */
export function containsNonLatinScripts(text: string): boolean {
  // CJK, Hangul, Cyrillic, Arabic, Devanagari, Thai, Hebrew ranges
  const nonLatinRegex = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff66-\uff9f\uac00-\ud7af\u0400-\u04ff\u0600-\u06ff\u0900-\u097f\u0e00-\u0e7f]/;
  return nonLatinRegex.test(text);
}

/**
 * Basic offline transliteration fallback for Cyrillic and basic symbols when offline.
 */
export function offlineFallbackRomanize(text: string): string {
  if (!text) return '';
  const cyrillicMap: Record<string, string> = {
    'А': 'A', 'Б': 'B', 'В': 'V', 'Г': 'G', 'Д': 'D', 'Е': 'E', 'Ё': 'Yo', 'Ж': 'Zh',
    'З': 'Z', 'И': 'I', 'Й': 'Y', 'К': 'K', 'Л': 'L', 'М': 'M', 'Н': 'N', 'О': 'O',
    'П': 'P', 'Р': 'R', 'С': 'S', 'Т': 'T', 'У': 'U', 'Ф': 'F', 'Х': 'Kh', 'Ц': 'Ts',
    'Ч': 'Ch', 'Ш': 'Sh', 'Щ': 'Shch', 'Ъ': '', 'Ы': 'Y', 'Ь': '', 'Э': 'E', 'Ю': 'Yu',
    'Я': 'Ya', 'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'yo',
    'ж': 'zh', 'з': 'z', 'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm', 'н': 'n',
    'о': 'o', 'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u', 'ф': 'f', 'х': 'kh',
    'ц': 'ts', 'ч': 'ch', 'ш': 'sh', 'щ': 'shch', 'ъ': '', 'ы': 'y', 'ь': '', 'э': 'e',
    'ю': 'yu', 'я': 'ya'
  };

  return text.split('').map(char => cyrillicMap[char] ?? char).join('');
}

function cleanMarkdown(text: string): string {
  let cleaned = text.replace(/^```[a-z]*\n?/mi, '').replace(/\n?```$/m, '');
  return cleaned.trim();
}

/**
 * Parses numbered lines formatted like "1. text" or "1: text" or falls back to line-by-line.
 */
export function parseNumberedLinesResponse(rawResponse: string, expectedCount: number): string[] {
  const cleaned = cleanMarkdown(rawResponse);
  const lines = cleaned.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
  const numberedMap = new Map<number, string>();

  for (const line of lines) {
    const match = line.match(/^(\d+)[\.\:\-\)]\s*(.*)$/);
    if (match) {
      const idx = parseInt(match[1], 10) - 1;
      if (idx >= 0 && idx < expectedCount + 20) {
        numberedMap.set(idx, match[2].trim());
      }
    }
  }

  // If we matched numbered items
  if (numberedMap.size > 0) {
    const result: string[] = [];
    for (let i = 0; i < expectedCount; i++) {
      result.push(numberedMap.get(i) ?? '');
    }
    return result;
  }

  // Otherwise direct line slice
  const result: string[] = [];
  for (let i = 0; i < expectedCount; i++) {
    const line = lines[i] ?? '';
    const stripped = line.replace(/^\d+[\.\:\-\)]\s*/, '').trim();
    result.push(stripped || line);
  }
  return result;
}

/**
 * Reconstructs synced lyrics payload from an array of synced lines with new text.
 */
export function reconstructSyncedLyrics(
  syncedLines: SyncedLyricsLineInput[],
  convertedTexts: string[]
): { syncedLines: SyncedLyricsLineInput[]; syncedLyrics: string; plainLyrics: string } {
  const reconstructedLines: SyncedLyricsLineInput[] = syncedLines.map((line, idx) => {
    const rawConverted = convertedTexts[idx];
    const newText = (typeof rawConverted === 'string' && rawConverted.trim().length > 0)
      ? rawConverted.trim()
      : (line.text || '');

    return {
      timestampMs: line.timestampMs,
      text: newText,
      kind: newText ? ('lyric' as const) : (line.kind ?? 'silence'),
      voice: line.voice ?? null
    };
  });

  const lrcLines: string[] = [];
  const plainLines: string[] = [];

  for (const line of reconstructedLines) {
    if (line.kind === 'silence' || !line.text) continue;
    const tag = formatLrcTimestamp(line.timestampMs);
    lrcLines.push(`${tag}${line.text}`);
    plainLines.push(line.text);
  }

  return {
    syncedLines: reconstructedLines,
    syncedLyrics: lrcLines.join('\n'),
    plainLyrics: plainLines.join('\n')
  };
}

/**
 * Romanizes structured synced lyrics lines, perfectly preserving timestampMs and sync cues.
 */
export async function romanizeSyncedLyrics(
  syncedLines: SyncedLyricsLineInput[],
  options: AiRequestOptions
): Promise<SyncedConversionResult> {
  if (!syncedLines || syncedLines.length === 0) {
    return { text: '', syncedLyrics: '', plainLyrics: '', syncedLines: [], tokens: 0, fromCache: false };
  }

  const lineTexts = syncedLines.map((l) => (l.kind === 'silence' ? '' : (l.text || '')));
  const fullText = lineTexts.filter(Boolean).join('\n');

  if (!containsNonLatinScripts(fullText)) {
    const reconstructed = reconstructSyncedLyrics(syncedLines, lineTexts);
    return {
      text: reconstructed.syncedLyrics,
      ...reconstructed,
      tokens: 0,
      fromCache: false
    };
  }

  const cacheKey = `${options.provider}:synced_rom_${syncedLines.length}_${fullText.slice(0, 80)}`;
  if (romanizeCache.has(cacheKey)) {
    const cachedTexts = JSON.parse(romanizeCache.get(cacheKey)!);
    const reconstructed = reconstructSyncedLyrics(syncedLines, cachedTexts);
    return {
      text: reconstructed.syncedLyrics,
      ...reconstructed,
      tokens: 0,
      fromCache: true
    };
  }

  if (options.provider === 'none' || (!options.apiKey && options.provider !== 'ollama')) {
    const fallbackTexts = lineTexts.map((t) => offlineFallbackRomanize(t));
    const reconstructed = reconstructSyncedLyrics(syncedLines, fallbackTexts);
    return {
      text: reconstructed.syncedLyrics,
      ...reconstructed,
      tokens: 0,
      fromCache: false
    };
  }

  try {
    const promptInput = lineTexts
      .map((text, idx) => `${idx + 1}. ${text}`)
      .join('\n');

    const res = await sendAiPrompt(
      ROMANIZE_LINES_SYSTEM_PROMPT,
      `Numbered lyrics to romanize:\n${promptInput}`,
      options
    );

    const convertedTexts = parseNumberedLinesResponse(res.text, lineTexts.length);
    const reconstructed = reconstructSyncedLyrics(syncedLines, convertedTexts);

    if (romanizeCache.size >= CACHE_LIMIT) {
      const firstKey = romanizeCache.keys().next().value;
      if (firstKey) romanizeCache.delete(firstKey);
    }
    romanizeCache.set(cacheKey, JSON.stringify(convertedTexts));

    return {
      text: reconstructed.syncedLyrics,
      ...reconstructed,
      tokens: res.tokens || 0,
      fromCache: false
    };
  } catch (err) {
    console.warn('[AiRomanizer] Synced romanization failed, falling back to offline transliteration:', err);
    const fallbackTexts = lineTexts.map((t) => offlineFallbackRomanize(t));
    const reconstructed = reconstructSyncedLyrics(syncedLines, fallbackTexts);
    return {
      text: reconstructed.syncedLyrics,
      ...reconstructed,
      tokens: 0,
      fromCache: false
    };
  }
}

/**
 * Translates structured synced lyrics lines, perfectly preserving timestampMs and sync cues.
 */
export async function translateSyncedLyrics(
  syncedLines: SyncedLyricsLineInput[],
  options: AiRequestOptions,
  targetLang: string = 'English'
): Promise<SyncedConversionResult> {
  if (!syncedLines || syncedLines.length === 0) {
    return { text: '', syncedLyrics: '', plainLyrics: '', syncedLines: [], tokens: 0, fromCache: false };
  }

  const lineTexts = syncedLines.map((l) => (l.kind === 'silence' ? '' : (l.text || '')));
  const fullText = lineTexts.filter(Boolean).join('\n');

  if (!fullText || options.provider === 'none') {
    const reconstructed = reconstructSyncedLyrics(syncedLines, lineTexts);
    return {
      text: reconstructed.syncedLyrics,
      ...reconstructed,
      tokens: 0,
      fromCache: false
    };
  }

  const cacheKey = `${options.provider}:${targetLang}:synced_trans_${syncedLines.length}_${fullText.slice(0, 80)}`;
  if (translateCache.has(cacheKey)) {
    const cachedTexts = JSON.parse(translateCache.get(cacheKey)!);
    const reconstructed = reconstructSyncedLyrics(syncedLines, cachedTexts);
    return {
      text: reconstructed.syncedLyrics,
      ...reconstructed,
      tokens: 0,
      fromCache: true
    };
  }

  try {
    const promptInput = lineTexts
      .map((text, idx) => `${idx + 1}. ${text}`)
      .join('\n');

    const res = await sendAiPrompt(
      TRANSLATE_LINES_SYSTEM_PROMPT(targetLang),
      `Numbered lyrics to translate into ${targetLang}:\n${promptInput}`,
      options
    );

    const convertedTexts = parseNumberedLinesResponse(res.text, lineTexts.length);
    const reconstructed = reconstructSyncedLyrics(syncedLines, convertedTexts);

    if (translateCache.size >= CACHE_LIMIT) {
      const firstKey = translateCache.keys().next().value;
      if (firstKey) translateCache.delete(firstKey);
    }
    translateCache.set(cacheKey, JSON.stringify(convertedTexts));

    return {
      text: reconstructed.syncedLyrics,
      ...reconstructed,
      tokens: res.tokens || 0,
      fromCache: false
    };
  } catch (err) {
    console.warn('[AiRomanizer] Synced translation failed:', err);
    const reconstructed = reconstructSyncedLyrics(syncedLines, lineTexts);
    return {
      text: reconstructed.syncedLyrics,
      ...reconstructed,
      tokens: 0,
      fromCache: false
    };
  }
}

/**
 * Romanizes lyrics text using AI or offline fallback.
 */
export async function romanizeLyrics(
  text: string,
  options: AiRequestOptions
): Promise<{ text: string; tokens: number; fromCache: boolean }> {
  if (!text || !containsNonLatinScripts(text)) {
    return { text, tokens: 0, fromCache: false };
  }

  const cacheKey = `${options.provider}:${text.slice(0, 100)}_${text.length}`;
  if (romanizeCache.has(cacheKey)) {
    return { text: romanizeCache.get(cacheKey)!, tokens: 0, fromCache: true };
  }

  if (options.provider === 'none' || (!options.apiKey && options.provider !== 'ollama')) {
    const fallback = offlineFallbackRomanize(text);
    return { text: fallback, tokens: 0, fromCache: false };
  }

  try {
    const res = await sendAiPrompt(
      ROMANIZE_SYSTEM_PROMPT,
      `Lyrics to romanize:\n${text}`,
      options
    );

    const cleaned = cleanMarkdown(res.text);
    if (cleaned && !res.error && cleaned !== text) {
      if (romanizeCache.size >= CACHE_LIMIT) {
        const firstKey = romanizeCache.keys().next().value;
        if (firstKey) romanizeCache.delete(firstKey);
      }
      romanizeCache.set(cacheKey, cleaned);
      return { text: cleaned, tokens: res.tokens || 0, fromCache: false };
    } else {
      if (res.error) throw new Error(res.error);
      const fallback = offlineFallbackRomanize(text);
      if (fallback === text) throw new Error("AI Romanization returned identical text and offline fallback cannot transliterate this script.");
      return { text: fallback, tokens: res.tokens || 0, fromCache: false };
    }
  } catch (err) {
    console.warn('[AiRomanizer] AI romanization failed, using fallback:', err);
    const fallback = offlineFallbackRomanize(text);
    if (fallback === text) {
      throw err;
    }
    return { text: fallback, tokens: 0, fromCache: false };
  }
}

/**
 * Translates lyrics to a target language (default English).
 */
export async function translateLyrics(
  text: string,
  options: AiRequestOptions,
  targetLang: string = 'English'
): Promise<{ text: string; tokens: number; fromCache: boolean }> {
  if (!text || options.provider === 'none') {
    return { text, tokens: 0, fromCache: false };
  }

  const cacheKey = `${options.provider}:${targetLang}:${text.slice(0, 100)}`;
  if (translateCache.has(cacheKey)) {
    return { text: translateCache.get(cacheKey)!, tokens: 0, fromCache: true };
  }

  try {
    const res = await sendAiPrompt(
      TRANSLATE_SYSTEM_PROMPT(targetLang),
      `Lyrics to translate:\n${text}`,
      options
    );

    const cleaned = cleanMarkdown(res.text);
    if (cleaned && !res.error) {
      if (translateCache.size >= CACHE_LIMIT) {
        const firstKey = translateCache.keys().next().value;
        if (firstKey) translateCache.delete(firstKey);
      }
      translateCache.set(cacheKey, cleaned);
      return { text: cleaned, tokens: res.tokens || 0, fromCache: false };
    }
  } catch (err) {
    console.warn('[AiRomanizer] AI translation failed:', err);
  }

  return { text, tokens: 0, fromCache: false };
}
