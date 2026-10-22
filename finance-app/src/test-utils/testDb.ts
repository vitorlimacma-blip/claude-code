import { randomUUID } from 'node:crypto';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { createSqliteSnapshotStore, type SnapshotStore } from '../data/backup';
import { createRepositoryContext, type RepositoryContext, type SqlExecutor } from '../data/context';

/**
 * Adapts Node's built-in SQLite (no native module to compile, so `npm install`
 * works on any machine) to the same executor interface the app uses with expo-sqlite.
 */
export function nodeSqliteExecutor(sqlite: DatabaseSync): SqlExecutor {
  return async (sql, params, method) => {
    const statement = sqlite.prepare(sql);
    const args = params as SQLInputValue[];
    if (method === 'run' || statement.columns().length === 0) {
      statement.run(...args);
      return { rows: [] };
    }
    statement.setReturnArrays(true);
    if (method === 'get') return { rows: statement.get(...args) as unknown as unknown[] };
    return { rows: statement.all(...args) };
  };
}

/** An in-memory SQLite database wired like the app's, for repository tests. */
export function createTestContext(options: { now?: Date } = {}): RepositoryContext & { sqlite: DatabaseSync } {
  const sqlite = new DatabaseSync(':memory:');
  const now = options.now ?? new Date('2026-03-10T12:00:00Z');
  const ctx = createRepositoryContext({ executor: nodeSqliteExecutor(sqlite), newId: randomUUID, now: () => now });
  return { ...ctx, sqlite };
}

/** A separate in-memory database for automatic backups, like `finance-backup.db` on device. */
export function createTestSnapshotStore(): SnapshotStore & { sqlite: DatabaseSync } {
  const sqlite = new DatabaseSync(':memory:');
  return { ...createSqliteSnapshotStore(nodeSqliteExecutor(sqlite), randomUUID), sqlite };
}
