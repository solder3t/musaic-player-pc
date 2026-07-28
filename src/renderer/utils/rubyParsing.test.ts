import assert from 'node:assert/strict'
import test from 'node:test'
import { hasRubyFurigana, parseRubySegments, renderTextWithFurigana } from './rubyParsing'

test('hasRubyFurigana detects explicit inline ruby and provided furigana', () => {
  assert.equal(hasRubyFurigana('plain text'), false)
  assert.equal(hasRubyFurigana('plain text', [{ start: 0, end: 5, base: 'plain', reading: 'プレイン' }]), true)
  assert.equal(hasRubyFurigana('わたしは{私|わたし}の歌をうたう'), true)
  assert.equal(hasRubyFurigana('わたしは<ruby>私<rt>わたし</rt></ruby>の歌をうたう'), true)
  assert.equal(hasRubyFurigana('no brackets or ruby tags [here] (or here)'), false)
})

test('parseRubySegments parses bracket and html ruby syntax into clean text and offsets', () => {
  const result1 = parseRubySegments('わたしは{私|わたし}の歌をうたう')
  assert.equal(result1.cleanText, 'わたしは私の歌をうたう')
  assert.deepEqual(result1.furigana, [
    { start: 4, end: 5, base: '私', reading: 'わたし' }
  ])

  const result2 = parseRubySegments('<ruby>漢字<rt>かんじ</rt></ruby>と言葉')
  assert.equal(result2.cleanText, '漢字と言葉')
  assert.deepEqual(result2.furigana, [
    { start: 0, end: 2, base: '漢字', reading: 'かんじ' }
  ])
})

test('renderTextWithFurigana returns clean string when disabled or no furigana', () => {
  assert.equal(renderTextWithFurigana('plain text', undefined, true), 'plain text')
  assert.equal(renderTextWithFurigana('わたしは{私|わたし}の歌をうたう', undefined, false), 'わたしは私の歌をうたう')
})
