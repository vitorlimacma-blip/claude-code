import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { createRepositoryContext, type RepositoryContext, type SqlExecutor } from '../data/context';

/** Adapts better-sqlite3 to the same executor interface the app uses with expo-sqlite. */
function betterSqliteExecutor(sqlite: Database.Database): SqlExecutor {
  return async (sql, params, method) => {
    const statement = sqlite.prepare(sql);
    if (method === 'run' || !statement.reader) {
      statement.run(...params);
      return { rows: [] };
    }
    statement.raw(true);
    if (method === 'get') return { rows: statement.get(...params) as unknown[] };
    return { rows: statement.all(...params) };
  };
}

/** An in-memory SQLite database wired like the app's, for repository tests. */
export function createTestContext(options: { now?: Date } = {}): RepositoryContext & {
  sqlite: Database.Database;
} {
  const sqlite = new Database(':memory:');
  const now = options.now ?? new Date('2026-03-10T12:00:00Z');
  const ctx = createRepositoryContext({ executor: betterSqliteExecutor(sqlite), newId: randomUUID, now: () => now });
  return { ...ctx, sqlite };
}
