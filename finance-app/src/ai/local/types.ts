// Contracts for running a language model on the person's own device or
// computer (AI contract §6). The domain never names a runtime or a host: an
// engine is chosen by configuration, and its absence never blocks the app.

export type EngineId = 'ollama_pc' | 'llama_rn';

/** Every state the interface shows (contract §5): never a fake answer while not ready. */
export type ModelState =
  | { kind: 'not_installed' }
  | { kind: 'awaiting_consent'; sizeBytes: number | null }
  | { kind: 'downloading'; receivedBytes: number; totalBytes: number | null }
  | { kind: 'paused'; receivedBytes: number; totalBytes: number | null }
  | { kind: 'verifying'; checkedBytes: number; totalBytes: number }
  | { kind: 'loading' }
  | { kind: 'ready'; modelId: string }
  | { kind: 'generating' }
  | { kind: 'insufficient_storage'; neededBytes: number; availableBytes: number }
  | { kind: 'invalid_file'; reason: string }
  | { kind: 'unavailable'; reason: string };

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface GenerateRequest {
  messages: ChatMessage[];
  /** Upper bound on generated tokens. */
  maxTokens: number;
  temperature?: number;
  /** Called with each piece of text as it is generated. */
  onToken?: (text: string) => void;
}

export interface GenerateResult {
  text: string;
  /** The request was cancelled; `text` holds what came before. */
  cancelled: boolean;
  /** Milliseconds to the first token and to the end, for the benchmark (device-benchmark.json). */
  firstTokenMs: number | null;
  totalMs: number;
}

/** A model runtime: initialize, readiness, generation with streaming, cancellation and release. */
export interface ModelEngine {
  readonly id: EngineId;
  /** Human label for advanced settings, e.g. "Ollama neste computador". */
  readonly label: string;
  /** Checks the runtime and the chosen model; never downloads anything by itself. */
  initialize(): Promise<ModelState>;
  state(): ModelState;
  generate(request: GenerateRequest): Promise<GenerateResult>;
  /** Stops the generation in progress; a new request works right after. */
  cancel(): void;
  /** Frees memory (e.g. when the app goes to the background). */
  release(): Promise<void>;
}

export class EngineUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EngineUnavailableError';
  }
}
