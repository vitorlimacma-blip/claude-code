import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AI_SETTINGS_KEY, createProvider, withDefaults, type AISettings } from '../ai/config';
import type { AIProvider, ProviderId } from '../ai/types';
import { secrets } from '../platform/secrets';
import { useRepositories } from './DataProvider';

const keyName = (provider: ProviderId) => `ai.apiKey.${provider}`;

interface AIContextValue {
  settings: AISettings;
  /** The configured provider, or null when AI is off or has no key (the app then uses local intelligence only). */
  provider: AIProvider | null;
  hasKey: Record<ProviderId, boolean>;
  loaded: boolean;
  saveSettings(next: AISettings): Promise<void>;
  /** Stores (or removes, with null) the API key of a provider. */
  saveKey(provider: ProviderId, key: string | null): Promise<void>;
}

const AIContext = createContext<AIContextValue | null>(null);

export function AIContextProvider({ children }: { children: ReactNode }) {
  const repos = useRepositories();
  const [settings, setSettings] = useState<AISettings>(() => withDefaults(null));
  const [keys, setKeys] = useState<Record<ProviderId, string | null>>({ claude: null, openai: null });
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    Promise.all([
      repos.settings.get<Partial<AISettings> | null>(AI_SETTINGS_KEY, null),
      secrets.get(keyName('claude')),
      secrets.get(keyName('openai')),
    ]).then(([saved, claude, openai]) => {
      setSettings(withDefaults(saved));
      setKeys({ claude, openai });
      setLoaded(true);
    });
  }, [repos]);

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
    };
  }, [settings, keys, loaded, saveSettings, saveKey]);

  return <AIContext.Provider value={value}>{children}</AIContext.Provider>;
}

export function useAI(): AIContextValue {
  const ctx = useContext(AIContext);
  if (!ctx) throw new Error('useAI must be used within an AIContextProvider');
  return ctx;
}
