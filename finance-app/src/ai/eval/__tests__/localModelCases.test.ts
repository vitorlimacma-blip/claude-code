// Local model cases of the AI contract (§6, E28–E30, E34). The runtime and
// the file system are TEST DOUBLES here (in-memory store, scripted Ollama
// stream): they prove the app's state machine and safety rules, not a real
// model. Real-model and device cases stay not_run.
import { createHash } from 'crypto';
import { prepareDatabase } from '../../../data/setup';
import { createTestContext } from '../../../test-utils/testDb';
import { answerQuestion } from '../../engine/answer';
import { LlamaRnEngine } from '../../local/llamaRn';
import { ModelManager, type DownloadHandle, type FileStore, type ManagerPersistence } from '../../local/manager';
import { OllamaEngine } from '../../local/ollama';
import cases from '../cases/D_cases_E01_E40.json';

const expected = (id: string) => cases.find((c) => c.id === id)!.expected_facts as Record<string, unknown>;

/** In-memory FileStore; `failAfter` simulates a download cut after that many bytes. */
function memoryStore(source: Uint8Array, options: { failAfter?: number; free?: number } = {}) {
  const files = new Map<string, Uint8Array>();
  let failAfter = options.failAfter;
  const store: FileStore = {
    dir: '/models',
    async exists(p) {
      return files.has(p);
    },
    async size(p) {
      return files.get(p)?.length ?? null;
    },
    async freeBytes() {
      return options.free ?? 10 ** 10;
    },
    download(_url, path, onProgress): DownloadHandle {
      const start = files.get(path)?.length ?? 0;
      const end = failAfter !== undefined ? Math.min(failAfter, source.length) : source.length;
      const done = (async () => {
        files.set(path, source.slice(0, end));
        onProgress(end, source.length);
        if (end < source.length) {
          failAfter = undefined; // the next attempt resumes and completes
          throw new Error('connection lost');
        }
        return 'finished' as const;
      })();
      void start;
      return { done, pause: async () => 'resume-token', cancel: () => undefined };
    },
    async readChunks(p, n, onChunk) {
      const data = files.get(p)!;
      for (let i = 0; i < data.length; i += n) onChunk(data.subarray(i, i + n));
    },
    async move(a, b) {
      files.set(b, files.get(a)!);
      files.delete(a);
    },
    async remove(p) {
      files.delete(p);
    },
  };
  return { store, files };
}

function memoryPersistence(): ManagerPersistence {
  const data = new Map<string, unknown>();
  return {
    async get<T>(k: string, f: T) {
      return (data.has(k) ? data.get(k) : f) as T;
    },
    async set(k, v) {
      data.set(k, v);
    },
  };
}

const weights = Uint8Array.from({ length: 50_000 }, (_, i) => (i * 13 + 5) & 255);
const goodHash = createHash('sha256').update(weights).digest('hex');
const artifact = (sha256: string | null = goodHash) => ({ id: 'test-model', filename: 'm.gguf', url: 'https://example.invalid/m.gguf', sha256, sizeBytes: weights.length });

describe('AI contract — local model management', () => {
  it('E30 HASH_MODELO_INVALIDO', async () => {
    const { store, files } = memoryStore(weights);
    const manager = new ModelManager(artifact('0'.repeat(64)), store, memoryPersistence());
    const state = await manager.install();
    expect(state.kind).toBe('invalid_file');
    expect({ load_allowed: (await manager.activeModelPath()) !== null }).toEqual(expected('E30'));
    // The rejected download is gone, and nothing was activated.
    expect([...files.keys()]).toEqual([]);
  });

  it('installs only after verifying the hash, atomically, and survives a restart', async () => {
    const { store } = memoryStore(weights);
    const persistence = memoryPersistence();
    const manager = new ModelManager(artifact(), store, persistence);
    expect(manager.requestInstall().kind).toBe('awaiting_consent');
    expect((await manager.install()).kind).toBe('ready');
    expect(await manager.activeModelPath()).toBe('/models/m.gguf');
    const reopened = new ModelManager(artifact(), store, persistence);
    expect((await reopened.refresh()).kind).toBe('ready');
    await reopened.uninstall();
    expect(await reopened.activeModelPath()).toBeNull();
  });

  it('E29 DOWNLOAD_INTERROMPIDO (parcial): o download cortado nunca é carregado e pode ser retomado', async () => {
    const { store } = memoryStore(weights, { failAfter: 20_000 });
    const persistence = memoryPersistence();
    const manager = new ModelManager(artifact(), store, persistence);
    const cut = await manager.install();
    expect(cut.kind).toBe('paused');
    expect(await manager.activeModelPath()).toBeNull();
    // "Restart" and retry.
    const again = new ModelManager(artifact(), store, persistence);
    expect((await again.install()).kind).toBe('ready');
  });

  it('refuses to install without a verified manifest or enough space', async () => {
    const { store } = memoryStore(weights, { free: 10 });
    expect(new ModelManager(artifact(null), store, memoryPersistence()).requestInstall().kind).toBe('unavailable');
    expect((await new ModelManager(artifact(), store, memoryPersistence()).install()).kind).toBe('insufficient_storage');
  });
});

describe('AI contract — local engines', () => {
  /** A scripted local Ollama: lists one model and streams NDJSON tokens slowly. */
  function fakeOllama(tokens: string[], delayMs = 5) {
    let calls = 0;
    const f = (async (url: string, init?: RequestInit) => {
      calls++;
      if (String(url).endsWith('/api/tags')) return new Response(JSON.stringify({ models: [{ name: 'qwen3.5:2b' }] }));
      const signal = init?.signal;
      const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
          for (const t of tokens) {
            if (signal?.aborted) {
              controller.error(new DOMException('aborted', 'AbortError'));
              return;
            }
            await new Promise((r) => setTimeout(r, delayMs));
            controller.enqueue(new TextEncoder().encode(JSON.stringify({ message: { content: t } }) + '\n'));
          }
          controller.close();
        },
      });
      return new Response(stream);
    }) as unknown as typeof fetch;
    return { f, calls: () => calls };
  }

  it('only talks to a model on this same computer', () => {
    expect(() => new OllamaEngine({ model: 'x', baseUrl: 'http://example.com:11434' })).toThrow(/localhost/);
  });

  it('E34 CANCELAMENTO_GERACAO (parcial): cancelar para a geração e a próxima pergunta funciona', async () => {
    const { f } = fakeOllama(Array.from({ length: 40 }, (_, i) => `t${i} `), 10);
    const engine = new OllamaEngine({ model: 'qwen3.5:2b', fetch: f });
    expect((await engine.initialize()).kind).toBe('ready');
    const pending = engine.generate({ messages: [{ role: 'user', content: 'oi' }], maxTokens: 100 });
    setTimeout(() => engine.cancel(), 35);
    const first = await pending;
    expect(first.cancelled).toBe(true);
    expect(first.text.split(' ').length).toBeLessThan(40);
    const second = await engine.generate({ messages: [{ role: 'user', content: 'de novo' }], maxTokens: 100 });
    expect(second.cancelled).toBe(false);
    expect(second.text.startsWith('t0 ')).toBe(true);
  });

  it('E28 SEM_MODELO_INSTALADO', async () => {
    // No development build (llama.rn not registered) and no weights: the engine says so; the app answers by rules, never by the cloud.
    const engine = new LlamaRnEngine({ modelPath: null, modelId: 'x', contextTokens: 2048 });
    const state = await engine.initialize();
    expect(state.kind).toBe('unavailable');
    const withModule = new LlamaRnEngine({ modelPath: null, modelId: 'x', contextTokens: 2048, module: { initLlama: async () => ({}) as never } });
    expect((await withModule.initialize()).kind).toBe('not_installed');
    const repos = await prepareDatabase(createTestContext());
    const answer = await answerQuestion({ question: 'Quanto gastei este mês?', history: [], repos, provider: null, webSearch: false });
    expect({ status: (await withModule.initialize()).kind === 'not_installed' ? 'model_not_installed' : 'other', cloud_fallback: answer.mode !== 'deterministic' }).toEqual(expected('E28'));
  });
});

describe('AI contract — local model only explains', () => {
  /** A scripted engine standing in for a model: returns whatever text the test gives. */
  function scripted(write: (prompt: string) => string) {
    let state: 'ready' | 'generating' = 'ready';
    return {
      id: 'ollama_pc' as const,
      label: 'teste',
      initialize: async () => ({ kind: 'ready' as const, modelId: 't' }),
      state: () => (state === 'ready' ? { kind: 'ready' as const, modelId: 't' } : { kind: 'generating' as const }),
      generate: async (req: { messages: { content: string }[] }) => {
        state = 'generating';
        const text = write(req.messages[1].content);
        state = 'ready';
        return { text, cancelled: false, firstTokenMs: 1, totalMs: 2 };
      },
      cancel: () => undefined,
      release: async () => undefined,
    };
  }

  async function ask(engine: ReturnType<typeof scripted>, question: string) {
    const repos = await prepareDatabase(createTestContext());
    await repos.demo.generate('2026-10-22');
    return answerQuestion({ question, history: [], repos, provider: null, webSearch: false, localEngine: engine, now: () => new Date('2026-10-22T12:00:00-03:00') });
  }

  it('shows the model text when every number and reference matches the calculated facts', async () => {
    const engine = scripted((prompt) => {
      const line = prompt.split('\n').find((l) => l.startsWith('- despesas líquidas'))!;
      const [, value, ref] = /: (R\$\s[\d.,]+) \[(E\d+)\]/.exec(line)!;
      return `Olhando seus dados, neste mês as despesas somam ${value} [${ref}].`;
    });
    const a = await ask(engine, 'Quanto gastei este mês?');
    expect(a.mode).toBe('local_model');
    expect(a.check.unverified).toEqual([]);
  });

  it('falls back to the calculated answer when the model changes a number or invents a reference', async () => {
    const changed = await ask(scripted(() => 'Você gastou R$ 1,00 [E1].'), 'Quanto gastei este mês?');
    expect(changed.mode).toBe('deterministic');
    expect(changed.notice).toMatch(/O modelo local mudou um valor/);
    const invented = await ask(scripted(() => 'Segundo o livro, página 42 [E9].'), 'Quanto gastei este mês?');
    expect(invented.mode).toBe('deterministic');
  });

  it('a local failure never goes to the cloud', async () => {
    const broken = { ...scripted(() => ''), generate: async () => Promise.reject(new Error('out of memory')) };
    const a = await ask(broken as never, 'Quanto gastei este mês?');
    expect(a.mode).toBe('deterministic');
    expect(a.notice).toMatch(/O modelo local não respondeu/);
  });
});
