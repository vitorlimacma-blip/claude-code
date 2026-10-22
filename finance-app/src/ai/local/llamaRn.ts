import { EngineUnavailableError, type GenerateRequest, type GenerateResult, type ModelEngine, type ModelState } from './types';

// Engine for phones, over llama.rn (llama.cpp). It does NOT import llama.rn:
// that native module can't run in Expo Go, which is how the app is tested
// today. A development build registers the module at startup (see
// docs/ai/user-setup.md); without it this engine reports "unavailable".

/** The part of llama.rn this engine uses (initLlama → context.completion / stopCompletion / release). */
export interface LlamaRnModule {
  initLlama(params: { model: string; n_ctx: number; n_gpu_layers?: number; use_mlock?: boolean }): Promise<LlamaRnContext>;
}
export interface LlamaRnContext {
  completion(
    params: { messages: { role: string; content: string }[]; n_predict: number; temperature: number },
    onPartial?: (data: { token: string }) => void
  ): Promise<{ text: string; interrupted?: boolean }>;
  stopCompletion(): Promise<void>;
  release(): Promise<void>;
}

let registered: LlamaRnModule | null = null;
/** Called only by the development build's entry, with `require('llama.rn')`. */
export function registerLlamaRn(module: LlamaRnModule): void {
  registered = module;
}
export function llamaRnAvailable(): boolean {
  return registered !== null;
}

export class LlamaRnEngine implements ModelEngine {
  readonly id = 'llama_rn' as const;
  readonly label = 'Modelo no aparelho';
  private current: ModelState = { kind: 'not_installed' };
  private context: LlamaRnContext | null = null;

  /** `modelPath` must point to a file the ModelManager already verified and activated. */
  constructor(private readonly options: { modelPath: string | null; modelId: string; contextTokens: number; module?: LlamaRnModule | null }) {}

  state(): ModelState {
    return this.current;
  }

  async initialize(): Promise<ModelState> {
    const module = this.options.module ?? registered;
    if (!module) {
      this.current = { kind: 'unavailable', reason: 'O modelo no aparelho precisa do app de desenvolvimento; no Expo Go ele não roda.' };
      return this.current;
    }
    if (!this.options.modelPath) {
      this.current = { kind: 'not_installed' };
      return this.current;
    }
    this.current = { kind: 'loading' };
    try {
      this.context = await module.initLlama({ model: this.options.modelPath, n_ctx: this.options.contextTokens, n_gpu_layers: 99 });
      this.current = { kind: 'ready', modelId: this.options.modelId };
    } catch {
      this.current = { kind: 'unavailable', reason: 'Não foi possível carregar o modelo (memória insuficiente ou arquivo incompatível).' };
    }
    return this.current;
  }

  async generate(request: GenerateRequest): Promise<GenerateResult> {
    if (!this.context || this.current.kind !== 'ready') throw new EngineUnavailableError('O modelo local não está pronto.');
    this.current = { kind: 'generating' };
    const started = Date.now();
    let firstTokenMs: number | null = null;
    try {
      const result = await this.context.completion(
        { messages: request.messages, n_predict: request.maxTokens, temperature: request.temperature ?? 0.2 },
        (data) => {
          firstTokenMs ??= Date.now() - started;
          request.onToken?.(data.token);
        }
      );
      return { text: result.text, cancelled: !!result.interrupted, firstTokenMs, totalMs: Date.now() - started };
    } finally {
      this.current = { kind: 'ready', modelId: this.options.modelId };
    }
  }

  cancel(): void {
    void this.context?.stopCompletion();
  }

  async release(): Promise<void> {
    await this.context?.release();
    this.context = null;
    this.current = { kind: 'not_installed' };
  }
}
