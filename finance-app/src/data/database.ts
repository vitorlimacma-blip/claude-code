import { randomUUID } from 'expo-crypto';
import { openDatabaseAsync, type SQLiteBindValue, type SQLiteDatabase } from 'expo-sqlite';
import { createSqliteSnapshotStore } from './backup';
import { createRepositoryContext, type SqlExecutor } from './context';
import type { Repositories } from './repositories';
import { prepareDatabase } from './setup';

// Same file name as the app's first version, so its data is migrated in place.
const DB_NAME = 'finance.db';
/** Automatic backups live in their own file, so a problem in the main database can't take them along. */
const BACKUP_DB_NAME = 'finance-backup.db';

/** Adapts expo-sqlite's async API to the executor Drizzle's sqlite-proxy driver expects. */
function expoExecutor(sqlite: SQLiteDatabase): SqlExecutor {
  return async (sql, params, method) => {
    const bind = params as SQLiteBindValue[];
    if (method === 'run') {
      await sqlite.runAsync(sql, bind);
      return { rows: [] };
    }
    const statement = await sqlite.prepareAsync(sql);
    try {
      const result = await statement.executeForRawResultAsync(bind);
      if (method === 'get') return { rows: (await result.getFirstAsync()) ?? undefined } as { rows: unknown[] };
      return { rows: await result.getAllAsync() };
    } finally {
      await statement.finalizeAsync();
    }
  };
}

/** Opens the on-device SQLite database (expo-sqlite), migrates it and returns the repositories. */
export async function openAppDatabase(): Promise<Repositories> {
  const sqlite = await openDatabaseAsync(DB_NAME);
  await sqlite.execAsync('PRAGMA journal_mode = WAL;');
  const backupSqlite = await openDatabaseAsync(BACKUP_DB_NAME);
  const backups = createSqliteSnapshotStore(expoExecutor(backupSqlite), randomUUID);
  const ctx = createRepositoryContext({ executor: expoExecutor(sqlite), newId: randomUUID });
  return prepareDatabase(ctx, { backups });
}
