import {
  DATA_TABLES,
  type DataSnapshot,
  parseSnapshot,
  restoreSnapshotInto,
  type SnapshotInfo,
  type SnapshotStore,
  snapshotHasData,
  takeSnapshot,
} from '../backup';
import { type RepositoryContext, ValidationError } from '../context';
import { applyDataMigrations } from '../dataMigrations';

/**
 * Export, import and automatic backups. Every restore (from a file or from an
 * automatic backup) first saves a backup of the current data, so it can be undone.
 */
export function createBackupRepository(ctx: RepositoryContext, store?: SnapshotStore) {
  async function backupNow(reason: 'pre-restore' | 'manual'): Promise<SnapshotInfo | null> {
    if (!store) return null;
    const snapshot = await takeSnapshot(ctx.db, reason, ctx.now());
    return snapshotHasData(snapshot) ? store.save(snapshot) : null;
  }

  async function restore(snapshot: DataSnapshot): Promise<Record<string, number>> {
    if (!snapshot.tables.accounts || !snapshot.tables.transactions) {
      throw new ValidationError('Backup incompleto: faltam contas ou lançamentos.');
    }
    if (!store) throw new ValidationError('Restauração indisponível: o armazenamento de backups não está aberto.');
    await backupNow('pre-restore');
    const restored = await ctx.write((tx) => restoreSnapshotInto(tx, snapshot));
    await applyDataMigrations(ctx);
    ctx.bus.emit(...DATA_TABLES);
    return restored;
  }

  return {
    /** Whether automatic backups (and therefore restores) are available on this device. */
    available: store !== undefined,

    /** Every row of every data table, soft-deleted ones included, as a versioned JSON document. */
    async exportJson(): Promise<string> {
      const snapshot = await takeSnapshot(ctx.db, 'export', ctx.now());
      const tables = Object.fromEntries(DATA_TABLES.filter((t) => snapshot.tables[t]).map((t) => [t, snapshot.tables[t]]));
      return JSON.stringify({ ...snapshot, tables });
    },

    /** Replaces all data with an exported file's, after validating it and backing up the current data. */
    async importJson(json: string): Promise<Record<string, number>> {
      return restore(parseSnapshot(json));
    },

    async backupNow(): Promise<SnapshotInfo | null> {
      return backupNow('manual');
    },

    async listBackups(): Promise<SnapshotInfo[]> {
      return store ? store.list() : [];
    },

    async restoreBackup(id: string): Promise<Record<string, number>> {
      const snapshot = store ? await store.load(id) : undefined;
      if (!snapshot) throw new ValidationError('Backup não encontrado.');
      return restore(snapshot);
    },
  };
}

export type BackupRepository = ReturnType<typeof createBackupRepository>;
