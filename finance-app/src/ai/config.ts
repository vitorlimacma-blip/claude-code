import { ClaudeProvider } from './providers/claude';
import { OpenAIProvider } from './providers/openai';
import type { AIProvider, ModelTier, ProviderId } from './types';

/**
 * Separate permissions per purpose (AI contract §7). All off by default; a
 * saved key never authorizes calls by itself, and a local failure never
 * turns any of them on.
 */
export interface AIPermissions {
  /** Send questions (and the minimum data they need) to the chosen external provider. */
  externalInference: boolean;
  /** Let the external provider search the web. */
  web: boolean;
  /** Use reviewed examples for future training. Nothing is trained today; this only records the choice. */
  trainingUse: boolean;
}

export const NO_PERMISSIONS: AIPermissions = { externalInference: false, web: false, trainingUse: false };

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
  permissions: AIPermissions;
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
  permissions: NO_PERMISSIONS,
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

/**
 * Merges saved settings over the defaults, so settings saved by older versions
 * keep working. Settings from before the permissions existed carry over the
 * person's explicit choices: picking a provider authorized it, and the web
 * search switch authorized the web (D-074).
 */
export function withDefaults(saved: Partial<AISettings> | null | undefined): AISettings {
  const legacy = saved && !saved.permissions;
  const permissions: AIPermissions = legacy
    ? { externalInference: (saved.provider ?? 'none') !== 'none', web: !!saved.webSearch, trainingUse: false }
    : { ...NO_PERMISSIONS, ...saved?.permissions };
  return {
    ...DEFAULT_AI_SETTINGS,
    ...saved,
    permissions,
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
  // A saved key is not an authorization: the external-inference permission is.
  if (settings.provider === 'none' || !apiKey || !settings.permissions.externalInference) return null;
  const common = { apiKey, models: settings.models[settings.provider], fetch: options.fetch };
  return settings.provider === 'claude' ? new ClaudeProvider(common) : new OpenAIProvider(common);
}

/** Web search only with both the switch and the web permission. */
export function webSearchAllowed(settings: AISettings): boolean {
  return settings.webSearch && settings.permissions.web && settings.permissions.externalInference;
}
