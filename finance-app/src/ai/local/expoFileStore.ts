import { File, Paths } from 'expo-file-system';
import { createDownloadResumable, deleteAsync, getInfoAsync, makeDirectoryAsync, moveAsync } from 'expo-file-system/legacy';
import type { DownloadHandle, FileStore } from './manager';

/**
 * FileStore on the phone: weights live in the app's document directory (kept
 * across updates, not a cache the system may clear), downloaded with a
 * resumable task and read back in chunks for hashing. Untested on a device
 * in this environment (no development build available): see docs/ai/user-setup.md.
 */
export function createExpoFileStore(): FileStore {
  const dir = `${Paths.document.uri.replace(/\/$/, '')}/models`;
  const ensureDir = () => makeDirectoryAsync(dir, { intermediates: true }).catch(() => undefined);
  return {
    dir,
    async exists(path) {
      return (await getInfoAsync(path)).exists;
    },
    async size(path) {
      const info = await getInfoAsync(path);
      return info.exists && !info.isDirectory ? (info.size ?? null) : null;
    },
    async freeBytes() {
      try {
        return Paths.availableDiskSpace;
      } catch {
        return null;
      }
    },
    download(url, path, onProgress, resumeData): DownloadHandle {
      const task = createDownloadResumable(url, path, {}, (p) => onProgress(p.totalBytesWritten, p.totalBytesExpectedToWrite > 0 ? p.totalBytesExpectedToWrite : null), resumeData);
      let state: 'finished' | 'paused' | 'cancelled' = 'finished';
      const done = ensureDir()
        .then(() => (resumeData ? task.resumeAsync() : task.downloadAsync()))
        .then(() => state);
      return {
        done,
        async pause() {
          state = 'paused';
          const saved = await task.pauseAsync();
          return saved.resumeData ?? null;
        },
        cancel() {
          state = 'cancelled';
          void task.cancelAsync();
        },
      };
    },
    async readChunks(path, chunkBytes, onChunk) {
      const handle = new File(path).open();
      try {
        const total = handle.size ?? 0;
        let read = 0;
        while (read < total) {
          const bytes = handle.readBytes(Math.min(chunkBytes, total - read));
          if (bytes.length === 0) break;
          onChunk(bytes);
          read += bytes.length;
          // Yield so the interface keeps responding during a multi-GB hash.
          await new Promise((resolve) => setTimeout(resolve, 0));
        }
      } finally {
        handle.close();
      }
    },
    async move(from, to) {
      await moveAsync({ from, to });
    },
    async remove(path) {
      await deleteAsync(path, { idempotent: true });
    },
  };
}
