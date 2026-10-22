import { EngineUnavailableError, type GenerateRequest, type GenerateResult, type ModelEngine, type ModelState } from './types';

// Engine for the PC prototype (contract §6, P1): a model served by Ollama on
// this same computer. Only loopback addresses are accepted, so questions never
// leave the machine. A localhost test is not proof of offline phone support.

const LOOPBACK = /^http:\/\/(localhost|127\.0\.0\.1|\[::1\]):\d{2,5}$/;
export const OLLAMA_DEFAULT_URL = 'http://127.0.0.1:11434';

export interface OllamaOptions {
  model: string;
  baseUrl?: string;
  fetch?: typeof fetch;
}

/** Models installed in the local Ollama, or null when it isn't running (or the browser was blocked by CORS). */
export async function listOllamaModels(baseUrl = OLLAMA_DEFAULT_URL, fetchImpl: typeof fetch = fetch): Promise<string[] | null> {
  if (!LOOPBACK.test(baseUrl)) return null;
  try {
    const res = await fetchImpl(`${baseUrl}/api/tags`);
    if (!res.ok) return null;
    const body = (await res.json()) as { models?: { name?: string }[] };
    return (body.models ?? []).map((m) => m.name ?? '').filter(Boolean);
  } catch {
    return null;
  }
}

export class OllamaEngine implements ModelEngine {
  readonly id = 'ollama_pc' as const;
  readonly label = 'Ollama neste computador';
  private current: ModelState = { kind: 'not_installed' };
  private controller: AbortController | null = null;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: OllamaOptions) {
    this.baseUrl = options.baseUrl ?? OLLAMA_DEFAULT_URL;
    if (!LOOPBACK.test(this.baseUrl)) throw new EngineUnavailableError('O Ollama precisa estar neste computador (localhost).');
    // Wrapped so the browser's fetch is never called with the engine as `this` ("Illegal invocation").
    this.fetchImpl = options.fetch ?? ((input, init) => fetch(input, init));
  }

  state(): ModelState {
    return this.current;
  }

  async initialize(): Promise<ModelState> {
    const models = await listOllamaModels(this.baseUrl, this.fetchImpl);
    if (models === null) {
      this.current = { kind: 'unavailable', reason: 'Ollama não respondeu neste computador. Abra o Ollama e libere o app (veja as instruções).' };
    } else if (!models.includes(this.options.model)) {
      this.current = { kind: 'not_installed' };
    } else {
      this.current = { kind: 'ready', modelId: this.options.model };
    }
    return this.current;
  }

  async generate(request: GenerateRequest): Promise<GenerateResult> {
    if (this.current.kind !== 'ready') throw new EngineUnavailableError('O modelo local não está pronto.');
    this.controller?.abort();
    const controller = new AbortController();
    this.controller = controller;
    this.current = { kind: 'generating' };
    const started = Date.now();
    let firstTokenMs: number | null = null;
    let text = '';
    try {
      const res = await this.fetchImpl(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.options.model,
          messages: request.messages,
          stream: true,
          options: { num_predict: request.maxTokens, temperature: request.temperature ?? 0.2 },
        }),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) throw new EngineUnavailableError(`O Ollama recusou o pedido (${res.status}).`);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffered = '';
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffered += decoder.decode(value, { stream: true });
        const lines = buffered.split('\n');
        buffered = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.trim()) continue;
          const piece = JSON.parse(line) as { message?: { content?: string }; done?: boolean };
          const chunk = piece.message?.content ?? '';
          if (chunk) {
            firstTokenMs ??= Date.now() - started;
            text += chunk;
            request.onToken?.(chunk);
          }
        }
      }
      return { text, cancelled: false, firstTokenMs, totalMs: Date.now() - started };
    } catch (error) {
      if (controller.signal.aborted) return { text, cancelled: true, firstTokenMs, totalMs: Date.now() - started };
      throw error;
    } finally {
      if (this.controller === controller) this.controller = null;
      this.current = { kind: 'ready', modelId: this.options.model };
    }
  }

  cancel(): void {
    this.controller?.abort();
  }

  async release(): Promise<void> {
    this.cancel();
  }
}
