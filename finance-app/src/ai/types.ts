/**
 * Provider-agnostic contract for the app's AI features. Everything outside
 * `src/ai/providers/` talks to this interface only, so the provider (Claude,
 * OpenAI, a local model, or a future server-side proxy for the commercial
 * version) can change without touching features or screens.
 */

export const PROVIDER_IDS = ['claude', 'openai'] as const;
export type ProviderId = (typeof PROVIDER_IDS)[number];

/** `fast` for high-volume, simple jobs (categorizing); `smart` for analysis and conversation. */
export type ModelTier = 'fast' | 'smart';

/** A JSON Schema object. Tool and output schemas must set `additionalProperties: false` and list every property in `required`. */
export type JsonSchema = Record<string, unknown>;

export interface JsonRequest {
  tier: ModelTier;
  system: string;
  prompt: string;
  /** Short identifier for the schema (letters, digits, underscores). */
  schemaName: string;
  schema: JsonSchema;
}

/** A function the model may call; it runs on the device, against local data. */
export interface LocalTool {
  name: string;
  description: string;
  parameters: JsonSchema;
  run(input: unknown): Promise<unknown>;
}

export interface ChatTurn {
  role: 'user' | 'assistant';
  text: string;
}

export interface AgentRequest {
  system: string;
  /** Conversation so far, ending with the user's new message. */
  history: ChatTurn[];
  tools: LocalTool[];
  /** Let the model search the internet (provider-hosted search). */
  webSearch: boolean;
  /** Upper bound on model round-trips for one answer. */
  maxSteps?: number;
  /** Called as each local tool starts, so the UI can show progress. */
  onToolCall?: (name: string, input: unknown) => void;
}

export interface AgentResult {
  text: string;
  toolCalls: { name: string; input: unknown }[];
  /** Web pages the answer drew on, when web search was used. */
  sources: { title: string; url: string }[];
}

export interface AIProvider {
  readonly id: ProviderId;
  /** One structured answer validated against `schema` by the provider. */
  generateJson<T>(request: JsonRequest): Promise<T>;
  /** A conversational answer that may call local tools and, optionally, search the web. */
  runAgent(request: AgentRequest): Promise<AgentResult>;
}

export type AIErrorKind = 'auth' | 'rate_limit' | 'network' | 'refusal' | 'invalid_output' | 'other';

export class AIError extends Error {
  constructor(
    public readonly kind: AIErrorKind,
    message: string,
    options?: { cause?: unknown }
  ) {
    super(message, options);
    this.name = 'AIError';
  }
}

/** User-facing (pt-BR) explanation of an AI failure. */
export function describeAIError(error: unknown): string {
  if (!(error instanceof AIError)) return 'Não foi possível falar com a IA agora. Tente novamente.';
  switch (error.kind) {
    case 'auth':
      return 'A chave de API foi recusada. Confira a chave em Ajustes › Inteligência artificial.';
    case 'rate_limit':
      return 'Limite de uso da IA atingido no momento. Aguarde um pouco e tente de novo.';
    case 'network':
      return 'Sem conexão com o provedor de IA. Verifique a internet.';
    case 'refusal':
      return 'A IA não quis responder a esse pedido. Tente reformular.';
    case 'invalid_output':
      return 'A IA respondeu em um formato inesperado. Tente novamente.';
    default:
      return error.message || 'Erro desconhecido na IA.';
  }
}
