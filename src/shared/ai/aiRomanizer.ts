import { sendAiPrompt, AiRequestOptions } from './aiClient';

const ROMANIZE_SYSTEM_PROMPT = `You are an expert lyrics romanization tool for audiophiles. Convert each line of lyrics from its original non-Latin script (Japanese, Chinese, Korean, Cyrillic, Hindi, Urdu, Arabic, Bengali, Tamil, Telugu, etc.) into readable Latin/Roman script (romanization/Pinyin/Romaji/Romaja).

Rules:
1. Preserve every line break exactly as given.
2. If a line contains LRC timestamps like [00:12.34], keep them unchanged at the absolute start of the line.
3. Lines that are already in Latin script or instrumental tags (like [Instrumental]) must be returned unchanged.
4. Do NOT add translations, explanations, or any extra conversational text.
5. Return ONLY the romanized lyrics text, nothing else.`;

const TRANSLATE_SYSTEM_PROMPT = (targetLang: string) => `You are an expert music lyrics translator. Translate each line of lyrics into ${targetLang} while keeping the poetic flow, rhythm, and emotional nuance intact.

Rules:
1. Preserve every line break exactly as given.
2. If a line contains LRC timestamps like [00:12.34], keep them unchanged at the absolute start of the line.
3. Do NOT add notes, explanations, or any extra conversational text.
4. Return ONLY the translated lyrics text, nothing else.`;

const CACHE_LIMIT = 50;
const romanizeCache = new Map<string, string>();
const translateCache = new Map<string, string>();

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
      throw err; // throw error back to renderer so it doesn't silently fail
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
