import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatLrcTimestamp,
  containsNonLatinScripts,
  offlineFallbackRomanize,
  parseNumberedLinesResponse,
  reconstructSyncedLyrics,
  romanizeSyncedLyrics,
  translateSyncedLyrics,
  type SyncedLyricsLineInput
} from './aiRomanizer.ts';

describe('aiRomanizer synced lyrics preservation', () => {
  it('formats LRC timestamps accurately', () => {
    assert.equal(formatLrcTimestamp(0), '[00:00.00]');
    assert.equal(formatLrcTimestamp(15230), '[00:15.23]');
    assert.equal(formatLrcTimestamp(65450), '[01:05.45]');
    assert.equal(formatLrcTimestamp(3600000), '[60:00.00]');
  });

  it('detects non-Latin scripts accurately', () => {
    assert.equal(containsNonLatinScripts('Hello world'), false);
    assert.equal(containsNonLatinScripts('English Lyrics (Extended Mix)'), false);
    assert.equal(containsNonLatinScripts('わたしは愛してる'), true); // Japanese Kanji/Hiragana
    assert.equal(containsNonLatinScripts('사랑해요'), true); // Korean Hangul
    assert.equal(containsNonLatinScripts('你好世界'), true); // Chinese Hanzi
    assert.equal(containsNonLatinScripts('Привет мир'), true); // Russian Cyrillic
    assert.equal(containsNonLatinScripts('तुम ही हो'), true); // Hindi (Devanagari)
    assert.equal(containsNonLatinScripts('ਮੇਰਾ ਦਿਲ'), true); // Punjabi (Gurmukhi)
    assert.equal(containsNonLatinScripts('நான் உன்னை காதலிக்கிறேன்'), true); // Tamil
    assert.equal(containsNonLatinScripts('నేను నిన్ను ప్రేమిస్తున్నాను'), true); // Telugu
    assert.equal(containsNonLatinScripts('আমি তোমাকে ভালোবাসি'), true); // Bengali
  });

  it('transliterates Cyrillic fallback accurately', () => {
    assert.equal(offlineFallbackRomanize('Привет мир'), 'Privet mir');
    assert.equal(offlineFallbackRomanize('Электроника'), 'Elektronika');
  });

  it('parses numbered lines response cleanly from LLM output', () => {
    const rawNumbered = `1. Watashi wa aishiteru
2. Kimi to futari de
3. Zutto zutto`;
    const parsed = parseNumberedLinesResponse(rawNumbered, 3);
    assert.deepEqual(parsed, [
      'Watashi wa aishiteru',
      'Kimi to futari de',
      'Zutto zutto'
    ]);
  });

  it('parses numbered lines with colon or parenthesis formatting', () => {
    const rawNumbered = `1: First line
2) Second line
3. Third line`;
    const parsed = parseNumberedLinesResponse(rawNumbered, 3);
    assert.deepEqual(parsed, [
      'First line',
      'Second line',
      'Third line'
    ]);
  });

  it('reconstructs synced lyrics preserving exact timestampMs and formatting LRC tags', () => {
    const originalSyncedLines: SyncedLyricsLineInput[] = [
      { timestampMs: 12000, text: 'わたしは愛してる' },
      { timestampMs: 15500, text: '君と二人で' },
      { timestampMs: 20000, text: 'ずっと' }
    ];

    const converted = [
      'Watashi wa aishiteru',
      'Kimi to futari de',
      'Zutto'
    ];

    const result = reconstructSyncedLyrics(originalSyncedLines, converted);
    assert.equal(result.syncedLines.length, 3);
    assert.equal(result.syncedLines[0].timestampMs, 12000);
    assert.equal(result.syncedLines[0].text, 'Watashi wa aishiteru');
    assert.equal(result.syncedLines[1].timestampMs, 15500);
    assert.equal(result.syncedLines[1].text, 'Kimi to futari de');
    assert.equal(result.syncedLines[2].timestampMs, 20000);
    assert.equal(result.syncedLines[2].text, 'Zutto');

    assert.equal(
      result.syncedLyrics,
      '[00:12.00]Watashi wa aishiteru\n[00:15.50]Kimi to futari de\n[00:20.00]Zutto'
    );
    assert.equal(
      result.plainLyrics,
      'Watashi wa aishiteru\nKimi to futari de\nZutto'
    );
  });

  it('romanizeSyncedLyrics uses offline fallback when provider is none or offline', async () => {
    const lines: SyncedLyricsLineInput[] = [
      { timestampMs: 5000, text: 'Привет' },
      { timestampMs: 10000, text: 'Мир' }
    ];

    const result = await romanizeSyncedLyrics(lines, {
      provider: 'none'
    });

    assert.equal(result.syncedLines.length, 2);
    assert.equal(result.syncedLines[0].timestampMs, 5000);
    assert.equal(result.syncedLines[0].text, 'Privet');
    assert.equal(result.syncedLines[1].timestampMs, 10000);
    assert.equal(result.syncedLines[1].text, 'Mir');
    assert.equal(result.syncedLyrics, '[00:05.00]Privet\n[00:10.00]Mir');
  });

  it('translateSyncedLyrics preserves timestampMs', async () => {
    const lines: SyncedLyricsLineInput[] = [
      { timestampMs: 3000, text: 'Line one' },
      { timestampMs: 8000, text: 'Line two' }
    ];

    const result = await translateSyncedLyrics(lines, {
      provider: 'none'
    });

    assert.equal(result.syncedLines.length, 2);
    assert.equal(result.syncedLines[0].timestampMs, 3000);
    assert.equal(result.syncedLines[1].timestampMs, 8000);
  });
});
