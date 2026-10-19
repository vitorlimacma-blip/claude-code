import { sql } from 'drizzle-orm';
import type { AppDatabase, SqlExecutor } from './context';
import { ValidationError } from './context';

// A snapshot is a complete raw copy of the data tables: every column and every
// row, soft-deleted ones included. The same format is used for the automatic
// backup taken before migrations and restores, and for the export file, so a
// single, tested restore path serves all of them.

export const SNAPSHOT_FORMAT = 'finance-app-data';
export const SNAPSHOT_VERSION = 1;

/** Tables that hold the user's data, in restore order. Anything else is never touched by a restore. */
export const DATA_TABLES = ['accounts', 'categories', 'budgets', 'transactions', 'settings'] as const;

export type SnapshotValue = string | number | null;

export type SnapshotReason = 'pre-migration' | 'pre-restore' | 'export' | 'manual';

export interface DataSnapshot {
  format: typeof SNAPSHOT_FORMAT;
  version: typeof SNAPSHOT_VERSION;
  createdAt: string;
  reason: SnapshotReason;
  /** Schema migrations applied when the snapshot was taken. */
  appliedMigrations: number;
  tables: Record<string, { columns: string[]; rows: SnapshotValue[][] }>;
}

export interface SnapshotInfo {
  id: string;
  createdAt: string;
  reason: SnapshotReason;
  /** Row count per table, for showing what a backup holds without loading it. */
  rowCounts: Record<string, number>;
}

/** Where automatic backups live: a separate SQLite file, apart from the main database. */
export interface SnapshotStore {
  save(snapshot: DataSnapshot): Promise<SnapshotInfo>;
  list(): Promise<SnapshotInfo[]>;
  load(id: string): Promise<DataSnapshot | undefined>;
}

const IDENTIFIER = /^[a-z_][a-z0-9_]*$/;

function quote(identifier: string): string {
  if (!IDENTIFIER.test(identifier)) throw new ValidationError('Nome de tabela ou coluna inválido no backup.');
  return `"${identifier}"`;
}

async function tableColumns(db: AppDatabase, table: string): Promise<string[]> {
  // PRAGMA table_info rows: [cid, name, type, notnull, dflt_value, pk].
  const rows = await db.all<[number, string]>(sql.raw(`PRAGMA table_info(${quote(table)})`));
  return rows.map((r) => r[1]);
}

export async function appliedMigrationCount(db: AppDatabase): Promise<number> {
  const exists = await db.all(sql`SELECT name FROM sqlite_master WHERE type = 'table' AND name = '__drizzle_migrations'`);
  if (exists.length === 0) return 0;
  const [row] = await db.all<[number]>(sql.raw('SELECT count(*) FROM "__drizzle_migrations"'));
  return row?.[0] ?? 0;
}

/** Every user table currently in the database (any schema version), except migration bookkeeping. */
async function existingTables(db: AppDatabase): Promise<string[]> {
  const rows = await db.all<[string]>(
    sql`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name != '__drizzle_migrations' ORDER BY name`
  );
  return rows.map((r) => r[0]);
}

/** Copies every row of every user table, whatever the schema version. */
export async function takeSnapshot(db: AppDatabase, reason: SnapshotReason, now: Date): Promise<DataSnapshot> {
  const tables: DataSnapshot['tables'] = {};
  for (const table of await existingTables(db)) {
    if (!IDENTIFIER.test(table)) continue;
    const columns = await tableColumns(db, table);
    const rows = await db.all<SnapshotValue[]>(
      sql.raw(`SELECT ${columns.map(quote).join(', ')} FROM ${quote(table)}`)
    );
    tables[table] = { columns, rows };
  }
  return {
    format: SNAPSHOT_FORMAT,
    version: SNAPSHOT_VERSION,
    createdAt: now.toISOString(),
    reason,
    appliedMigrations: await appliedMigrationCount(db),
    tables,
  };
}

export function snapshotRowCounts(snapshot: DataSnapshot): Record<string, number> {
  return Object.fromEntries(Object.entries(snapshot.tables).map(([t, v]) => [t, v.rows.length]));
}

/** True when there's anything worth backing up. */
export function snapshotHasData(snapshot: DataSnapshot): boolean {
  return Object.values(snapshot.tables).some((t) => t.rows.length > 0);
}

/**
 * Validates an untrusted snapshot (e.g. an export file picked by the user).
 * Checks structure only; the restore itself also only touches known tables
 * and columns that exist in the current schema.
 */
export function parseSnapshot(json: string): DataSnapshot {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    throw new ValidationError('O arquivo não é um backup válido (JSON ilegível).');
  }
  const s = data as Partial<DataSnapshot>;
  if (!s || typeof s !== 'object' || s.format !== SNAPSHOT_FORMAT) {
    throw new ValidationError('O arquivo não é um backup deste app.');
  }
  if (s.version !== SNAPSHOT_VERSION) {
    throw new ValidationError('Versão de backup não suportada por esta versão do app.');
  }
  if (!s.tables || typeof s.tables !== 'object') throw new ValidationError('Backup sem tabelas.');
  for (const [table, content] of Object.entries(s.tables)) {
    if (!IDENTIFIER.test(table) || !content || !Array.isArray(content.columns) || !Array.isArray(content.rows)) {
      throw new ValidationError('Backup com estrutura inválida.');
    }
    if (!content.columns.every((c) => typeof c === 'string' && IDENTIFIER.test(c))) {
      throw new ValidationError('Backup com colunas inválidas.');
    }
    for (const row of content.rows) {
      if (
        !Array.isArray(row) ||
        row.length !== content.columns.length ||
        !row.every((v) => v === null || typeof v === 'string' || (typeof v === 'number' && Number.isFinite(v)))
      ) {
        throw new ValidationError('Backup com registros inválidos.');
      }
    }
  }
  return s as DataSnapshot;
}

/**
 * Replaces the contents of the data tables with the snapshot's, inside the
 * given transaction (all or nothing). Columns the snapshot lacks get their
 * schema defaults (older snapshots); columns the schema lacks are ignored.
 * Data tables absent from the snapshot are left as they are.
 */
export async function restoreSnapshotInto(tx: AppDatabase, snapshot: DataSnapshot): Promise<Record<string, number>> {
  const restored: Record<string, number> = {};
  for (const table of DATA_TABLES) {
    const content = snapshot.tables[table];
    if (!content) continue;
    const current = new Set(await tableColumns(tx, table));
    const keep = content.columns.map((c, i) => [c, i] as const).filter(([c]) => current.has(c));
    if (keep.length === 0) continue;
    await tx.run(sql.raw(`DELETE FROM ${quote(table)}`));
    const insert = sql.raw(`INSERT INTO ${quote(table)} (${keep.map(([c]) => quote(c)).join(', ')}) VALUES `);
    // Chunked so each statement stays under SQLite's bound-parameter limit.
    const chunkSize = Math.max(1, Math.floor(900 / keep.length));
    for (let start = 0; start < content.rows.length; start += chunkSize) {
      const tuples = content.rows
        .slice(start, start + chunkSize)
        .map((row) => sql`(${sql.join(keep.map(([, i]) => sql`${row[i]}`), sql`, `)})`);
      await tx.run(sql`${insert}${sql.join(tuples, sql`, `)}`);
    }
    restored[table] = content.rows.length;
  }
  return restored;
}

/** Keeps this many automatic backups; older ones are pruned. */
export const MAX_SNAPSHOTS = 10;

/**
 * A `SnapshotStore` in its own SQLite database (`finance-backup.db` on
 * device), reached through a raw executor so it works with any driver.
 */
export function createSqliteSnapshotStore(executor: SqlExecutor, newId: () => string): SnapshotStore {
  let ready: Promise<void> | null = null;
  const init = () =>
    (ready ??= executor(
      'CREATE TABLE IF NOT EXISTS snapshots (id TEXT PRIMARY KEY NOT NULL, created_at TEXT NOT NULL, reason TEXT NOT NULL, row_counts TEXT NOT NULL, payload TEXT NOT NULL)',
      [],
      'run'
    ).then(() => undefined));

  const toInfo = (row: unknown[]): SnapshotInfo => ({
    id: String(row[0]),
    createdAt: String(row[1]),
    reason: row[2] as SnapshotReason,
    rowCounts: JSON.parse(String(row[3])),
  });

  return {
    async save(snapshot) {
      await init();
      const info: SnapshotInfo = {
        id: newId(),
        createdAt: snapshot.createdAt,
        reason: snapshot.reason,
        rowCounts: snapshotRowCounts(snapshot),
      };
      await executor(
        'INSERT INTO snapshots (id, created_at, reason, row_counts, payload) VALUES (?, ?, ?, ?, ?)',
        [info.id, info.createdAt, info.reason, JSON.stringify(info.rowCounts), JSON.stringify(snapshot)],
        'run'
      );
      await executor(
        'DELETE FROM snapshots WHERE id NOT IN (SELECT id FROM snapshots ORDER BY created_at DESC, rowid DESC LIMIT ?)',
        [MAX_SNAPSHOTS],
        'run'
      );
      // Read it back: a backup that can't be loaded isn't a backup.
      const check = await executor('SELECT payload FROM snapshots WHERE id = ?', [info.id], 'get');
      if (!check.rows || (check.rows as unknown[]).length === 0) throw new Error('Backup write could not be verified');
      parseSnapshot(String((check.rows as unknown[])[0]));
      return info;
    },
    async list() {
      await init();
      const { rows } = await executor(
        'SELECT id, created_at, reason, row_counts FROM snapshots ORDER BY created_at DESC, rowid DESC',
        [],
        'all'
      );
      return (rows as unknown[][]).map(toInfo);
    },
    async load(id) {
      await init();
      const { rows } = await executor('SELECT payload FROM snapshots WHERE id = ?', [id], 'get');
      const row = rows as unknown[] | undefined;
      return row && row.length > 0 ? parseSnapshot(String(row[0])) : undefined;
    },
  };
}
