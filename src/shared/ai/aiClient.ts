export type AiProviderType = 'gemini' | 'openai' | 'claude' | 'deepseek' | 'groq' | 'ollama' | 'none';

export interface AiResponse {
  text: string;
  tokens?: number;
  error?: string;
}

export interface AiRequestOptions {
  provider: AiProviderType;
  apiKey?: string;
  serverUrl?: string; // e.g. 'http://localhost:11434' for Ollama
  model?: string;
}

export const DEFAULT_MODELS: Record<AiProviderType, string> = {
  gemini: 'gemini-3.6-flash',
  openai: 'gpt-4o-mini',
  claude: 'claude-3-5-haiku-latest',
  deepseek: 'deepseek-chat',
  groq: 'llama-3.3-70b-versatile',
  ollama: 'llama3.2',
  none: ''
};

export const PROVIDER_MODEL_PRESETS: Record<AiProviderType, string[]> = {
  gemini: [
    'gemini-3.7-flash',
    'gemini-3.6-flash',
    'gemini-3.5-flash',
    'gemini-3.5-flash-lite'
  ],
  openai: [
    'gpt-4o-mini',
    'gpt-4o',
    'o3-mini',
    'o1-mini'
  ],
  claude: [
    'claude-3-7-sonnet-latest',
    'claude-3-5-haiku-latest',
    'claude-3-5-sonnet-latest'
  ],
  deepseek: [
    'deepseek-chat',
    'deepseek-reasoner'
  ],
  groq: [
    'llama-3.3-70b-versatile',
    'llama-3.1-8b-instant',
    'mixtral-8x7b-32768'
  ],
  ollama: [
    'llama3.2',
    'llama3.3',
    'mistral',
    'qwen2.5',
    'deepseek-r1'
  ],
  none: []
};

export const DEPRECATED_MODELS: Record<string, string> = {
  // Gemini (Remove all 2.x and 1.x, and Pro models -> map to Flash)
  'gemini-2.5-pro': 'gemini-3.6-flash',
  'gemini-2.5-flash': 'gemini-3.6-flash',
  'gemini-2.0-flash': 'gemini-3.6-flash',
  'gemini-2.0-flash-exp': 'gemini-3.6-flash',
  'gemini-2.0-flash-lite-preview': 'gemini-3.5-flash-lite',
  'gemini-2.0-flash-thinking-exp': 'gemini-3.7-flash',
  'gemini-2.0-pro-exp-02-05': 'gemini-3.7-flash',
  'gemini-1.5-flash': 'gemini-3.6-flash',
  'gemini-1.5-flash-8b': 'gemini-3.5-flash-lite',
  'gemini-1.5-pro': 'gemini-3.6-flash',
  'gemini-1.0-pro': 'gemini-3.6-flash',
  'gemini-pro': 'gemini-3.6-flash',
  'gemini-3.1-pro': 'gemini-3.7-flash',
  // OpenAI (Remove legacy gpt-3.5 and deprecated preview models)
  'gpt-3.5-turbo': 'gpt-4o-mini',
  'gpt-3.5-turbo-0125': 'gpt-4o-mini',
  'gpt-3.5-turbo-1106': 'gpt-4o-mini',
  'gpt-4-turbo': 'gpt-4o',
  'gpt-4-turbo-preview': 'gpt-4o-mini',
  'gpt-4-0125-preview': 'gpt-4o',
  'gpt-4-1106-preview': 'gpt-4o',
  'gpt-4-vision-preview': 'gpt-4o',
  'text-davinci-003': 'gpt-4o-mini',
  'text-davinci-002': 'gpt-4o-mini',
  // Claude (Remove legacy 2.x and retired 3.0 models)
  'claude-3-haiku-20240307': 'claude-3-5-haiku-latest',
  'claude-3-sonnet-20240229': 'claude-3-7-sonnet-latest',
  'claude-3-opus-20240229': 'claude-3-7-sonnet-latest',
  'claude-2.1': 'claude-3-5-haiku-latest',
  'claude-2.0': 'claude-3-5-haiku-latest',
  'claude-instant-1.2': 'claude-3-5-haiku-latest',
  // Groq (Remove decommissioned models)
  'llama-3.1-70b-versatile': 'llama-3.3-70b-versatile',
  'llama3-8b-8192': 'llama-3.1-8b-instant',
  'llama3-70b-8192': 'llama-3.3-70b-versatile',
  'llama2-70b-4096': 'llama-3.3-70b-versatile',
  'gemma-7b-it': 'llama-3.3-70b-versatile',
  'gemma2-9b-it': 'llama-3.3-70b-versatile'
};

export function getModelForProvider(provider: AiProviderType, configuredModel?: string): string {
  const trimmed = configuredModel?.trim() || '';
  if (!trimmed) {
    return DEFAULT_MODELS[provider] || '';
  }
  return DEPRECATED_MODELS[trimmed] || trimmed;
}

/**
 * Sends a prompt to the designated AI provider using standard fetch.
 */
export async function sendAiPrompt(
  systemPrompt: string,
  userPrompt: string,
  options: AiRequestOptions
): Promise<AiResponse> {
  const { provider, apiKey = '', serverUrl = 'http://localhost:11434' } = options;
  if (provider === 'none') return { text: '' };
  if (provider !== 'ollama' && !apiKey.trim()) {
    return { text: '', error: 'API Key required for provider: ' + provider };
  }

  const model = getModelForProvider(provider, options.model);

  try {
    switch (provider) {
      case 'gemini':
        return await callGemini(systemPrompt, userPrompt, apiKey, model);
      case 'openai':
        return await callOpenAiCompatible(
          systemPrompt,
          userPrompt,
          apiKey,
          'https://api.openai.com/v1/chat/completions',
          model
        );
      case 'claude':
        return await callClaude(systemPrompt, userPrompt, apiKey, model);
      case 'deepseek':
        return await callOpenAiCompatible(
          systemPrompt,
          userPrompt,
          apiKey,
          'https://api.deepseek.com/chat/completions',
          model
        );
      case 'groq':
        return await callOpenAiCompatible(
          systemPrompt,
          userPrompt,
          apiKey,
          'https://api.groq.com/openai/v1/chat/completions',
          model
        );
      case 'ollama': {
        const baseUrl = serverUrl.replace(/\/+$/, '') || 'http://localhost:11434';
        return await callOpenAiCompatible(
          systemPrompt,
          userPrompt,
          apiKey,
          `${baseUrl}/v1/chat/completions`,
          model
        );
      }
      default:
        return { text: '' };
    }
  } catch (err: any) {
    console.error(`[AiClient] Error calling ${provider}:`, err);
    return { text: '', error: err?.message || String(err) };
  }
}

async function callGemini(
  systemPrompt: string,
  userPrompt: string,
  apiKey: string,
  model: string
): Promise<AiResponse> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const body = {
    contents: [
      {
        parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }]
      }
    ],
    generationConfig: {
      temperature: 0.3
    }
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    throw new Error(`Gemini API error (${res.status}): ${await res.text()}`);
  }

  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
  const tokens = data?.usageMetadata?.totalTokenCount || 0;
  return { text: text.trim(), tokens };
}

async function callOpenAiCompatible(
  systemPrompt: string,
  userPrompt: string,
  apiKey: string,
  url: string,
  model: string
): Promise<AiResponse> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  };
  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }

  const body = {
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ],
    temperature: 0.3
  };

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    throw new Error(`OpenAI-compatible API error (${res.status}): ${await res.text()}`);
  }

  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content || '';
  const tokens = data?.usage?.total_tokens || 0;
  return { text: text.trim(), tokens };
}

async function callClaude(
  systemPrompt: string,
  userPrompt: string,
  apiKey: string,
  model: string
): Promise<AiResponse> {
  const url = 'https://api.anthropic.com/v1/messages';
  const body = {
    model,
    max_tokens: 1024,
    system: systemPrompt,
    messages: [
      { role: 'user', content: userPrompt }
    ],
    temperature: 0.3
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    throw new Error(`Claude API error (${res.status}): ${await res.text()}`);
  }

  const data = await res.json();
  const text = data?.content?.[0]?.text || '';
  const tokens = (data?.usage?.input_tokens || 0) + (data?.usage?.output_tokens || 0);
  return { text: text.trim(), tokens };
}
