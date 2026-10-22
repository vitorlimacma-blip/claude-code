import { Sha256 } from '../knowledge/sha256';
import type { ModelState } from './types';

// Installs the model weights on the device (contract §6): explicit download,
// progress, pause and resume, free-space check, and SHA-256 verification
// BEFORE an atomic activation. A partial file or a different hash is never
// loaded. Removing the model never touches the person's finances.

export interface ModelArtifact {
  id: string;
  filename: string;
  /** Null until verified from the model's official source: then nothing can be installed. */
  url: string | null;
  sha256: string | null;
  sizeBytes: number | null;
}

export interface DownloadHandle {
  done: Promise<'finished' | 'paused' | 'cancelled'>;
  /** Pauses; returns data to resume later (kept across app restarts). */
  pause(): Promise<string | null>;
  cancel(): void;
}

/** Storage operations, implemented with expo-file-system on phones and in memory in tests. */
export interface FileStore {
  readonly dir: string;
  exists(path: string): Promise<boolean>;
  size(path: string): Promise<number | null>;
  freeBytes(): Promise<number | null>;
  download(url: string, path: string, onProgress: (received: number, total: number | null) => void, resumeData?: string): DownloadHandle;
  /** Reads the file in order, chunk by chunk. */
  readChunks(path: string, chunkBytes: number, onChunk: (bytes: Uint8Array) => void): Promise<void>;
  move(from: string, to: string): Promise<void>;
  remove(path: string): Promise<void>;
}

/** Small key/value persistence for resume data and the activation record (the app's settings). */
export interface ManagerPersistence {
  get<T>(key: string, fallback: T): Promise<T>;
  set(key: string, value: unknown): Promise<void>;
}

const KEY = 'ai.localModel';
const HASH_CHUNK = 4 * 1024 * 1024;
/** Space kept free beyond the file itself. */
const SPACE_MARGIN = 1.1;

interface Persisted {
  /** The verified, activated artifact: only this file may ever be loaded. */
  active: { id: string; sha256: string; sizeBytes: number } | null;
  resumeData: string | null;
}

export class ModelManager {
  private current: ModelState = { kind: 'not_installed' };
  private download: DownloadHandle | null = null;
  private listeners = new Set<(s: ModelState) => void>();

  constructor(
    private readonly artifact: ModelArtifact,
    private readonly store: FileStore,
    private readonly persistence: ManagerPersistence
  ) {}

  get finalPath(): string {
    return `${this.store.dir}/${this.artifact.filename}`;
  }
  private get partPath(): string {
    return `${this.finalPath}.part`;
  }

  state(): ModelState {
    return this.current;
  }
  subscribe(listener: (s: ModelState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  private set(state: ModelState) {
    this.current = state;
    for (const l of this.listeners) l(state);
  }

  private async load(): Promise<Persisted> {
    return this.persistence.get<Persisted>(KEY, { active: null, resumeData: null });
  }

  /** The manifest has what is needed to install safely. */
  get installable(): boolean {
    return !!(this.artifact.url && this.artifact.sha256 && this.artifact.sizeBytes);
  }

  /** Where things stand after a start: an activated file that still matches its record, a paused download, or nothing. */
  async refresh(): Promise<ModelState> {
    const saved = await this.load();
    if (saved.active && saved.active.id === this.artifact.id && saved.active.sha256 === this.artifact.sha256) {
      const size = await this.store.size(this.finalPath);
      if (size === saved.active.sizeBytes) {
        this.set({ kind: 'ready', modelId: this.artifact.id });
        return this.current;
      }
      await this.persistence.set(KEY, { ...saved, active: null });
    }
    if (saved.resumeData && (await this.store.exists(this.partPath))) {
      this.set({ kind: 'paused', receivedBytes: (await this.store.size(this.partPath)) ?? 0, totalBytes: this.artifact.sizeBytes });
      return this.current;
    }
    this.set({ kind: 'not_installed' });
    return this.current;
  }

  /** Shows the size and asks for consent; nothing is downloaded yet. */
  requestInstall(): ModelState {
    if (!this.installable) {
      this.set({ kind: 'unavailable', reason: 'O modelo ainda não tem origem e hash verificados no manifesto; a instalação fica bloqueada.' });
    } else {
      this.set({ kind: 'awaiting_consent', sizeBytes: this.artifact.sizeBytes });
    }
    return this.current;
  }

  /** Downloads (or resumes) after the person agreed, then verifies and activates. */
  async install(): Promise<ModelState> {
    if (!this.installable) return this.requestInstall();
    const needed = Math.ceil(this.artifact.sizeBytes! * SPACE_MARGIN);
    const free = await this.store.freeBytes();
    const already = (await this.store.size(this.partPath)) ?? 0;
    if (free !== null && free + already < needed) {
      this.set({ kind: 'insufficient_storage', neededBytes: needed, availableBytes: free });
      return this.current;
    }
    const saved = await this.load();
    this.set({ kind: 'downloading', receivedBytes: already, totalBytes: this.artifact.sizeBytes });
    this.download = this.store.download(
      this.artifact.url!,
      this.partPath,
      (received, total) => this.set({ kind: 'downloading', receivedBytes: received, totalBytes: total ?? this.artifact.sizeBytes }),
      saved.resumeData ?? undefined
    );
    let outcome: 'finished' | 'paused' | 'cancelled';
    try {
      outcome = await this.download.done;
    } catch {
      // Interrupted (network, app killed): keep the partial file to resume; it is never loaded.
      this.set({ kind: 'paused', receivedBytes: (await this.store.size(this.partPath)) ?? 0, totalBytes: this.artifact.sizeBytes });
      return this.current;
    } finally {
      this.download = null;
    }
    if (outcome !== 'finished') return this.current;
    await this.persistence.set(KEY, { ...saved, resumeData: null });
    return this.verifyAndActivate();
  }

  /** Hashes the downloaded file; activates it (atomic move) only if it matches the manifest. */
  async verifyAndActivate(): Promise<ModelState> {
    const total = (await this.store.size(this.partPath)) ?? 0;
    if (this.artifact.sizeBytes !== null && total !== this.artifact.sizeBytes) {
      return this.reject(`Tamanho diferente do esperado (${total} de ${this.artifact.sizeBytes} bytes).`);
    }
    const hash = new Sha256();
    let checked = 0;
    this.set({ kind: 'verifying', checkedBytes: 0, totalBytes: total });
    await this.store.readChunks(this.partPath, HASH_CHUNK, (bytes) => {
      hash.update(bytes);
      checked += bytes.length;
      this.set({ kind: 'verifying', checkedBytes: checked, totalBytes: total });
    });
    const digest = hash.digestHex();
    if (digest !== this.artifact.sha256) return this.reject('O arquivo baixado não confere com o hash aprovado.');
    await this.store.remove(this.finalPath);
    await this.store.move(this.partPath, this.finalPath);
    const saved = await this.load();
    await this.persistence.set(KEY, { ...saved, active: { id: this.artifact.id, sha256: digest, sizeBytes: total } });
    this.set({ kind: 'ready', modelId: this.artifact.id });
    return this.current;
  }

  private async reject(reason: string): Promise<ModelState> {
    await this.store.remove(this.partPath);
    const saved = await this.load();
    await this.persistence.set(KEY, { ...saved, resumeData: null });
    this.set({ kind: 'invalid_file', reason });
    return this.current;
  }

  async pause(): Promise<void> {
    if (!this.download) return;
    const resumeData = await this.download.pause();
    const saved = await this.load();
    await this.persistence.set(KEY, { ...saved, resumeData });
    this.set({ kind: 'paused', receivedBytes: (await this.store.size(this.partPath)) ?? 0, totalBytes: this.artifact.sizeBytes });
  }

  async cancel(): Promise<void> {
    this.download?.cancel();
    await this.store.remove(this.partPath);
    const saved = await this.load();
    await this.persistence.set(KEY, { ...saved, resumeData: null });
    this.set({ kind: 'not_installed' });
  }

  /** Removes the weights (and any partial download). Finances are untouched. */
  async uninstall(): Promise<void> {
    await this.cancel();
    await this.store.remove(this.finalPath);
    await this.persistence.set(KEY, { active: null, resumeData: null });
    this.set({ kind: 'not_installed' });
  }

  /** The only path an engine may load: the activated, verified file. */
  async activeModelPath(): Promise<string | null> {
    const saved = await this.load();
    if (!saved.active || saved.active.sha256 !== this.artifact.sha256 || saved.active.id !== this.artifact.id) return null;
    return (await this.store.size(this.finalPath)) === saved.active.sizeBytes ? this.finalPath : null;
  }
}
