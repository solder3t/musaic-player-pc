import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_MODELS,
  DEPRECATED_MODELS,
  PROVIDER_MODEL_PRESETS,
  getModelForProvider,
  type AiProviderType
} from './aiClient.ts';

describe('aiClient model configuration and deprecation handling', () => {
  it('defines active default models for all providers', () => {
    assert.equal(DEFAULT_MODELS.gemini, 'gemini-3.6-flash');
    assert.equal(DEFAULT_MODELS.openai, 'gpt-4o-mini');
    assert.equal(DEFAULT_MODELS.claude, 'claude-3-5-haiku-latest');
    assert.equal(DEFAULT_MODELS.deepseek, 'deepseek-chat');
    assert.equal(DEFAULT_MODELS.groq, 'llama-3.3-70b-versatile');
    assert.equal(DEFAULT_MODELS.ollama, 'llama3.2');
  });

  it('maps deprecated models to their current equivalents', () => {
    assert.equal(DEPRECATED_MODELS['gemini-2.0-flash'], 'gemini-3.6-flash');
    assert.equal(DEPRECATED_MODELS['gemini-2.0-flash-exp'], 'gemini-3.6-flash');
    assert.equal(DEPRECATED_MODELS['gemini-2.5-flash'], 'gemini-3.6-flash');
    assert.equal(DEPRECATED_MODELS['gemini-2.5-pro'], 'gemini-3.6-flash');
    assert.equal(DEPRECATED_MODELS['gemini-1.5-flash'], 'gemini-3.6-flash');
    assert.equal(DEPRECATED_MODELS['gemini-1.5-pro'], 'gemini-3.6-flash');
    assert.equal(DEPRECATED_MODELS['gpt-3.5-turbo'], 'gpt-4o-mini');
    assert.equal(DEPRECATED_MODELS['gpt-4-turbo'], 'gpt-4o');
    assert.equal(DEPRECATED_MODELS['claude-3-haiku-20240307'], 'claude-3-5-haiku-latest');
    assert.equal(DEPRECATED_MODELS['llama-3.1-70b-versatile'], 'llama-3.3-70b-versatile');
    assert.equal(DEPRECATED_MODELS['llama3-70b-8192'], 'llama-3.3-70b-versatile');
  });

  it('getModelForProvider migrates deprecated models and uses defaults when unspecified', () => {
    assert.equal(getModelForProvider('gemini', 'gemini-2.0-flash'), 'gemini-3.6-flash');
    assert.equal(getModelForProvider('gemini', undefined), 'gemini-3.6-flash');
    assert.equal(getModelForProvider('gemini', ''), 'gemini-3.6-flash');
    assert.equal(getModelForProvider('gemini', 'gemini-2.5-pro'), 'gemini-3.6-flash');

    assert.equal(getModelForProvider('openai', 'gpt-3.5-turbo'), 'gpt-4o-mini');
    assert.equal(getModelForProvider('claude', 'claude-3-haiku-20240307'), 'claude-3-5-haiku-latest');
    assert.equal(getModelForProvider('groq', 'llama-3.1-70b-versatile'), 'llama-3.3-70b-versatile');
  });

  it('PROVIDER_MODEL_PRESETS includes default models in the preset list for each provider', () => {
    const providers: AiProviderType[] = ['gemini', 'openai', 'claude', 'deepseek', 'groq', 'ollama'];
    for (const provider of providers) {
      const presets = PROVIDER_MODEL_PRESETS[provider];
      assert.ok(Array.isArray(presets) && presets.length > 0, `Provider ${provider} has presets`);
      const defaultModel = DEFAULT_MODELS[provider];
      assert.ok(presets.includes(defaultModel), `Provider ${provider} presets include default model ${defaultModel}`);
    }
  });

  it('validates API keys and returns clean error descriptions', async () => {
    const { sendAiPrompt } = await import('./aiClient.ts');
    const resNoKey = await sendAiPrompt('sys', 'user', { provider: 'gemini', apiKey: '' });
    assert.ok(resNoKey.error?.includes('API Key required'));

    const resNone = await sendAiPrompt('sys', 'user', { provider: 'none' });
    assert.equal(resNone.text, '');
    assert.equal(resNone.error, undefined);
  });
});
