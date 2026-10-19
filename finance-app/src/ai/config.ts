import { ClaudeProvider } from './providers/claude';
import { OpenAIProvider } from './providers/openai';
import type { AIProvider, ModelTier, ProviderId } from './types';

export interface AISettings {
  /** Active provider, or 'none' to run with local intelligence only. */
  provider: ProviderId | 'none';
  models: Record<ProviderId, Record<ModelTier, string>>;
  /** Allow the assistant to search the internet for outside information. */
  webSearch: boolean;
  /** Ask the AI for a category when local rules aren't confident. */
  aiCategorization: boolean;
  /**
   * Learn from the categories the user picks or corrects. Off: suggestions
   * come only from the built-in rules and from categories set by imports or
   * accepted suggestions, not from manual choices.
   */
  learnFromCorrections: boolean;
}

export const AI_SETTINGS_KEY = 'ai.settings';

export const DEFAULT_AI_SETTINGS: AISettings = {
  provider: 'none',
  models: {
    claude: { fast: 'claude-opus-5-5', smart: 'claude-opus-5-5' },
    openai: { fast: 'gpt-5.4-mini', smart: 'gpt-5.5' },
  },
  webSearch: false,
  aiCategorization: true,
  learnFromCorrections: true,
};

export const PROVIDER_LABELS: Record<ProviderId, string> = {
  claude: 'Claude (Anthropic)',
  openai: 'ChatGPT (OpenAI)',
};

export const PROVIDER_KEY_HINTS: Record<ProviderId, string> = {
  claude: 'Crie em console.anthropic.com › API Keys (começa com "sk-ant-").',
  openai: 'Crie em platform.openai.com › API keys (começa com "sk-").',
};

/** Suggested models per provider; the settings screen also accepts any other model id. */
export const MODEL_OPTIONS: Record<ProviderId, { id: string; label: string }[]> = {
  claude: [
    { id: 'claude-opus-5-5', label: 'Opus 5.5 (mais capaz)' },
    { id: 'claude-sonnet-5-5', label: 'Sonnet 5.5 (equilibrado)' },
    { id: 'claude-haiku-5-5', label: 'Haiku 5.5 (rápido e barato)' },
  ],
  openai: [
    { id: 'gpt-5.5', label: 'GPT-5.5' },
    { id: 'gpt-5.4', label: 'GPT-5.4' },
    { id: 'gpt-5.4-mini', label: 'GPT-5.4 mini (rápido e barato)' },
  ],
};

/** Merges saved settings over the defaults, so settings saved by older versions keep working. */
export function withDefaults(saved: Partial<AISettings> | null | undefined): AISettings {
  return {
    ...DEFAULT_AI_SETTINGS,
    ...saved,
    models: {
      claude: { ...DEFAULT_AI_SETTINGS.models.claude, ...saved?.models?.claude },
      openai: { ...DEFAULT_AI_SETTINGS.models.openai, ...saved?.models?.openai },
    },
  };
}

export function createProvider(
  settings: AISettings,
  apiKey: string | null,
  options: { fetch?: typeof fetch } = {}
): AIProvider | null {
  if (settings.provider === 'none' || !apiKey) return null;
  const common = { apiKey, models: settings.models[settings.provider], fetch: options.fetch };
  return settings.provider === 'claude' ? new ClaudeProvider(common) : new OpenAIProvider(common);
}
