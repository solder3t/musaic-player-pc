import { create } from 'zustand';
import {
  type AiProviderType,
  DEFAULT_MODELS,
  PROVIDER_MODEL_PRESETS,
  DEPRECATED_MODELS
} from '../../shared/ai/aiClient';

export {
  type AiProviderType,
  DEFAULT_MODELS,
  PROVIDER_MODEL_PRESETS,
  DEPRECATED_MODELS
};

export const AI_SETTINGS_STORAGE_KEY = 'musaic-ai-settings-v1';

export interface AiSettings {
  provider: AiProviderType;
  apiKey: string;
  serverUrl: string;
  model: string;
  autoRomanize: boolean;
  autoTranslate: boolean;
  targetLanguage: string;
}

export interface AiSettingsStore {
  settings: AiSettings;
  setProvider: (provider: AiProviderType) => void;
  setApiKey: (apiKey: string) => void;
  setServerUrl: (serverUrl: string) => void;
  setModel: (model: string) => void;
  setAutoRomanize: (enabled: boolean) => void;
  setAutoTranslate: (enabled: boolean) => void;
  setTargetLanguage: (language: string) => void;
  resetToDefaults: () => void;
}

export const DEFAULT_AI_SETTINGS: AiSettings = {
  provider: 'gemini',
  apiKey: '',
  serverUrl: 'http://localhost:11434',
  model: DEFAULT_MODELS.gemini,
  autoRomanize: false,
  autoTranslate: false,
  targetLanguage: 'English',
};

let storageListenerInstalled = false;

function readSettings(): AiSettings {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(AI_SETTINGS_STORAGE_KEY) : null;
    if (!raw) return { ...DEFAULT_AI_SETTINGS };
    const parsed = JSON.parse(raw);
    const provider: AiProviderType = parsed?.provider || DEFAULT_AI_SETTINGS.provider;
    let loadedModel = typeof parsed?.model === 'string' ? parsed.model.trim() : '';

    // Migrate deprecated models or populate missing model
    if (!loadedModel) {
      loadedModel = DEFAULT_MODELS[provider] || DEFAULT_AI_SETTINGS.model;
    } else if (DEPRECATED_MODELS[loadedModel]) {
      loadedModel = DEPRECATED_MODELS[loadedModel];
    }

    return {
      provider,
      apiKey: typeof parsed?.apiKey === 'string' ? parsed.apiKey : DEFAULT_AI_SETTINGS.apiKey,
      serverUrl: typeof parsed?.serverUrl === 'string' ? parsed.serverUrl : DEFAULT_AI_SETTINGS.serverUrl,
      model: loadedModel,
      autoRomanize: typeof parsed?.autoRomanize === 'boolean' ? parsed.autoRomanize : DEFAULT_AI_SETTINGS.autoRomanize,
      autoTranslate: typeof parsed?.autoTranslate === 'boolean' ? parsed.autoTranslate : DEFAULT_AI_SETTINGS.autoTranslate,
      targetLanguage: typeof parsed?.targetLanguage === 'string' ? parsed.targetLanguage : DEFAULT_AI_SETTINGS.targetLanguage,
    };
  } catch {
    return { ...DEFAULT_AI_SETTINGS };
  }
}

function persistSettings(settings: AiSettings): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(AI_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    }
  } catch {
    // ignore storage errors
  }
}

export const useAiSettingsStore = create<AiSettingsStore>((set) => {
  const applySettings = (settings: AiSettings) => {
    persistSettings(settings);
    set({ settings });
  };

  if (!storageListenerInstalled && typeof window !== 'undefined') {
    storageListenerInstalled = true;
    window.addEventListener('storage', (event) => {
      if (event.key !== AI_SETTINGS_STORAGE_KEY) return;
      set({ settings: readSettings() });
    });
  }

  return {
    settings: readSettings(),
    setProvider: (provider) => set((state) => {
      const prevProvider = state.settings.provider;
      const prevDefault = DEFAULT_MODELS[prevProvider] || '';
      const newDefault = DEFAULT_MODELS[provider] || '';
      const prevPresets = PROVIDER_MODEL_PRESETS[prevProvider] || [];

      // If the model was empty, was a preset of the old provider, or is deprecated, switch to the new provider's default
      const model = (!state.settings.model || state.settings.model === prevDefault || prevPresets.includes(state.settings.model) || DEPRECATED_MODELS[state.settings.model])
        ? newDefault
        : state.settings.model;

      const settings = { ...state.settings, provider, model };
      persistSettings(settings);
      return { settings };
    }),
    setApiKey: (apiKey) => set((state) => {
      const settings = { ...state.settings, apiKey };
      persistSettings(settings);
      return { settings };
    }),
    setServerUrl: (serverUrl) => set((state) => {
      const settings = { ...state.settings, serverUrl };
      persistSettings(settings);
      return { settings };
    }),
    setModel: (model) => set((state) => {
      const settings = { ...state.settings, model };
      persistSettings(settings);
      return { settings };
    }),
    setAutoRomanize: (autoRomanize) => set((state) => {
      const settings = { ...state.settings, autoRomanize };
      persistSettings(settings);
      return { settings };
    }),
    setAutoTranslate: (autoTranslate) => set((state) => {
      const settings = { ...state.settings, autoTranslate };
      persistSettings(settings);
      return { settings };
    }),
    setTargetLanguage: (targetLanguage) => set((state) => {
      const settings = { ...state.settings, targetLanguage };
      persistSettings(settings);
      return { settings };
    }),
    resetToDefaults: () => applySettings({ ...DEFAULT_AI_SETTINGS }),
  };
});
