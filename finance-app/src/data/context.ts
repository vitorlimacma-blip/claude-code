import { drizzle, type AsyncRemoteCallback } from 'drizzle-orm/sqlite-proxy';
import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';
import { createChangeBus, type ChangeBus } from './changes';
import { schema } from './schema';

/**
 * The Drizzle database every repository works with. It is asynchronous and
 * driver-agnostic: a `SqlExecutor` adapts the actual SQLite engine (expo-sqlite
 * on iOS/Android/web, better-sqlite3 in tests, a server later).
 */
export type AppDatabase = BaseSQLiteDatabase<'async', any, typeof schema>;

/**
 * Executes one SQL statement. For `all`/`values` it must return every row as
 * an array of column values; for `get`, the first such row (or undefined).
 */
export type SqlExecutor = AsyncRemoteCallback;

export interface RepositoryContext {
  db: AppDatabase;
  bus: ChangeBus;
  /**
   * Runs `fn` in a database transaction, one at a time: concurrent writes
   * queue up instead of interleaving on the single SQLite connection.
   * Every repository mutation goes through here.
   */
  write<T>(fn: (tx: AppDatabase) => Promise<T>): Promise<T>;
  /** UUID generator (expo-crypto on device, node:crypto in tests). */
  newId: () => string;
  /** Current time; injectable so tests are deterministic. */
  now: () => Date;
}

export function createRepositoryContext(options: {
  executor: SqlExecutor;
  newId: () => string;
  now?: () => Date;
}): RepositoryContext {
  const db: AppDatabase = drizzle(options.executor, { schema });
  let queue: Promise<unknown> = Promise.resolve();

  return {
    db,
    bus: createChangeBus(),
    newId: options.newId,
    now: options.now ?? (() => new Date()),
    write(fn) {
      const result = queue.then(() => db.transaction((tx) => fn(tx)));
      queue = result.catch(() => undefined);
      return result;
    },
  };
}

export function timestamp(ctx: RepositoryContext): string {
  return ctx.now().toISOString();
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}
