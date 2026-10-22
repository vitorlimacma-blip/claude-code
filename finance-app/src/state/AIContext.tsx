import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Platform } from 'react-native';
import { AI_SETTINGS_KEY, createProvider, withDefaults, type AISettings } from '../ai/config';
import { LlamaRnEngine } from '../ai/local/llamaRn';
import { CANDIDATE_MODEL } from '../ai/local/manifest';
import { OllamaEngine } from '../ai/local/ollama';
import type { ModelEngine, ModelState } from '../ai/local/types';
import type { AIProvider, ProviderId } from '../ai/types';
import { secrets } from '../platform/secrets';
import { useRepositories } from './DataProvider';

const keyName = (provider: ProviderId) => `ai.apiKey.${provider}`;

/** Local model choice: on the computer, a model in this machine's Ollama; on phones, the verified file (development build only). */
export interface LocalModelSettings {
  enabled: boolean;
  /** Ollama model name, e.g. "qwen3.5:2b". */
  ollamaModel: string;
}
export const LOCAL_MODEL_KEY = 'ai.localModel.settings';
export const DEFAULT_LOCAL_MODEL: LocalModelSettings = { enabled: false, ollamaModel: 'qwen3.5:2b' };

interface AIContextValue {
  settings: AISettings;
  /** The configured provider, or null when AI is off or has no key (the app then uses local intelligence only). */
  provider: AIProvider | null;
  hasKey: Record<ProviderId, boolean>;
  loaded: boolean;
  saveSettings(next: AISettings): Promise<void>;
  /** Stores (or removes, with null) the API key of a provider. */
  saveKey(provider: ProviderId, key: string | null): Promise<void>;
  local: LocalModelSettings;
  /** The local engine when enabled (ready or not); its state says whether it can answer. */
  localEngine: ModelEngine | null;
  localState: ModelState;
  saveLocal(next: LocalModelSettings): Promise<void>;
  /** Checks the local engine again (e.g. after starting Ollama). */
  refreshLocal(): Promise<void>;
}

const AIContext = createContext<AIContextValue | null>(null);

export function AIContextProvider({ children }: { children: ReactNode }) {
  const repos = useRepositories();
  const [settings, setSettings] = useState<AISettings>(() => withDefaults(null));
  const [keys, setKeys] = useState<Record<ProviderId, string | null>>({ claude: null, openai: null });
  const [loaded, setLoaded] = useState(false);
  const [local, setLocal] = useState<LocalModelSettings>(DEFAULT_LOCAL_MODEL);
  const [localState, setLocalState] = useState<ModelState>({ kind: 'not_installed' });

  useEffect(() => {
    Promise.all([
      repos.settings.get<Partial<AISettings> | null>(AI_SETTINGS_KEY, null),
      secrets.get(keyName('claude')),
      secrets.get(keyName('openai')),
      repos.settings.get<LocalModelSettings | null>(LOCAL_MODEL_KEY, null),
    ]).then(([saved, claude, openai, savedLocal]) => {
      setSettings(withDefaults(saved));
      setKeys({ claude, openai });
      setLocal({ ...DEFAULT_LOCAL_MODEL, ...savedLocal });
      setLoaded(true);
    });
  }, [repos]);

  // The local engine follows its setting; it never downloads anything by itself.
  const localEngine = useMemo<ModelEngine | null>(() => {
    if (!local.enabled) return null;
    return Platform.OS === 'web'
      ? new OllamaEngine({ model: local.ollamaModel })
      : new LlamaRnEngine({ modelPath: null, modelId: CANDIDATE_MODEL.id, contextTokens: CANDIDATE_MODEL.contextTokens });
  }, [local.enabled, local.ollamaModel]);

  const refreshLocal = useCallback(async () => {
    if (!localEngine) {
      setLocalState({ kind: 'not_installed' });
      return;
    }
    setLocalState({ kind: 'loading' });
    setLocalState(await localEngine.initialize());
  }, [localEngine]);

  useEffect(() => {
    if (!localEngine) return;
    let current = true;
    void localEngine.initialize().then((state) => current && setLocalState(state));
    // The engine is released when it is replaced or turned off (its next initialize loads it again).
    return () => {
      current = false;
      void localEngine.release();
    };
  }, [localEngine]);

  const saveLocal = useCallback(
    async (next: LocalModelSettings) => {
      await repos.settings.set(LOCAL_MODEL_KEY, next);
      setLocal(next);
    },
    [repos]
  );

  const saveSettings = useCallback(
    async (next: AISettings) => {
      await repos.settings.set(AI_SETTINGS_KEY, next);
      setSettings(next);
    },
    [repos]
  );

  const saveKey = useCallback(async (provider: ProviderId, key: string | null) => {
    const value = key?.trim() || null;
    await secrets.set(keyName(provider), value);
    setKeys((prev) => ({ ...prev, [provider]: value }));
  }, []);

  const value = useMemo<AIContextValue>(() => {
    const activeKey = settings.provider === 'none' ? null : keys[settings.provider];
    return {
      settings,
      provider: createProvider(settings, activeKey),
      hasKey: { claude: !!keys.claude, openai: !!keys.openai },
      loaded,
      saveSettings,
      saveKey,
      local,
      localEngine,
      localState: localEngine ? localState : { kind: 'not_installed' },
      saveLocal,
      refreshLocal,
    };
  }, [settings, keys, loaded, saveSettings, saveKey, local, localEngine, localState, saveLocal, refreshLocal]);

  return <AIContext.Provider value={value}>{children}</AIContext.Provider>;
}

export function useAI(): AIContextValue {
  const ctx = useContext(AIContext);
  if (!ctx) throw new Error('useAI must be used within an AIContextProvider');
  return ctx;
}
