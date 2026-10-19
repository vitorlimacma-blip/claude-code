import { parseSnapshot, takeSnapshot, type SnapshotStore } from '../backup';
import { ValidationError } from '../context';
import { countInconsistentNatures } from '../dataMigrations';
import { migrate, pendingMigrationCount, prepareDatabase } from '../setup';
import { createTestContext, createTestSnapshotStore } from '../../test-utils/testDb';

const T = '2026-01-01T00:00:00Z';

/** A database as the previous app version left it: schema migration 0000 only, with real-looking data. */
async function legacyDatabase() {
  const ctx = createTestContext();
  await migrate(ctx.db, 1);
  ctx.sqlite.exec(`
    INSERT INTO accounts (id, created_at, updated_at, name, type, color, initial_balance, closing_day, due_day)
      VALUES ('itau', '${T}', '${T}', 'Itaú', 'checking', '#f00', 100000, NULL, NULL),
             ('card', '${T}', '${T}', 'Cartão', 'credit_card', '#00f', 0, 10, 17),
             ('xp', '${T}', '${T}', 'XP', 'investment', '#0f0', 0, NULL, NULL);
    INSERT INTO transactions (id, created_at, updated_at, deleted_at, account_id, category_id, type, amount, date, description, transfer_pair_id)
      VALUES ('salary', '${T}', '${T}', NULL, 'itau', 'sys-receita-salario', 'income', 800000, '2026-02-05', 'SALARIO', NULL),
             ('market', '${T}', '${T}', NULL, 'card', 'sys-alimentacao-mercado', 'expense', 35000, '2026-02-12', 'MERCADO', NULL),
             ('deleted', '${T}', '${T}', '${T}', 'itau', NULL, 'expense', 999, '2026-02-13', 'APAGADO', NULL),
             ('pay-out', '${T}', '${T}', NULL, 'itau', NULL, 'transfer_out', 35000, '2026-03-17', 'FATURA', 'pay'),
             ('pay-in', '${T}', '${T}', NULL, 'card', NULL, 'transfer_in', 35000, '2026-03-17', 'FATURA', 'pay'),
             ('inv-out', '${T}', '${T}', NULL, 'itau', NULL, 'transfer_out', 100000, '2026-02-06', 'APLICACAO', 'inv'),
             ('inv-in', '${T}', '${T}', NULL, 'xp', NULL, 'transfer_in', 100000, '2026-02-06', 'APLICACAO', 'inv'),
             ('orphan', '${T}', '${T}', NULL, 'itau', NULL, 'transfer_out', 500, '2026-02-07', 'PERNA SOLTA', 'lost');
    INSERT INTO settings (key, value, updated_at) VALUES ('ai.provider', '"none"', '${T}');
  `);
  return ctx;
}

const rowsOf = (ctx: ReturnType<typeof createTestContext>, table: string) =>
  ctx.sqlite.prepare(`SELECT * FROM ${table} ORDER BY 1`).all();

describe('migration 0001 with automatic backup', () => {
  it('backs up first, preserves every record (deleted ones too) and infers natures', async () => {
    const ctx = await legacyDatabase();
    const store = createTestSnapshotStore();
    const before = ctx.sqlite.prepare('SELECT id, amount, date, type, deleted_at FROM transactions ORDER BY id').all();
    expect(await pendingMigrationCount(ctx.db)).toBe(1);

    const repos = await prepareDatabase(ctx, { backups: store });

    const backups = await store.list();
    expect(backups).toHaveLength(1);
    expect(backups[0]).toMatchObject({ reason: 'pre-migration', rowCounts: { transactions: 8, accounts: 3, settings: 1 } });

    const after = ctx.sqlite.prepare('SELECT id, amount, date, type, deleted_at FROM transactions ORDER BY id').all();
    expect(after).toEqual(before);
    const natures = Object.fromEntries(
      ctx.sqlite.prepare('SELECT id, nature FROM transactions').all().map((r) => [r.id as string, r.nature as string])
    );
    expect(natures).toEqual({
      salary: 'income',
      market: 'expense',
      deleted: 'expense',
      'pay-out': 'card_payment',
      'pay-in': 'card_payment',
      'inv-out': 'investment_contribution',
      'inv-in': 'investment_contribution',
      orphan: 'transfer',
    });
    expect((await repos.transactions.get('market'))?.invoiceMonth).toBe('2026-03');
    expect((await repos.transactions.get('salary'))?.currency).toBe('BRL');
    expect(await countInconsistentNatures(ctx)).toBe(0);
  });

  it('is idempotent: running again changes nothing and takes no new backup', async () => {
    const ctx = await legacyDatabase();
    const store = createTestSnapshotStore();
    await prepareDatabase(ctx, { backups: store });
    const snapshot = rowsOf(ctx, 'transactions');
    await prepareDatabase(ctx, { backups: store });
    await prepareDatabase(ctx, { backups: store });
    expect(rowsOf(ctx, 'transactions')).toEqual(snapshot);
    expect(await store.list()).toHaveLength(1);
    expect(await pendingMigrationCount(ctx.db)).toBe(0);
  });

  it('does not migrate when the backup cannot be saved', async () => {
    const ctx = await legacyDatabase();
    const failing: SnapshotStore = {
      save: () => Promise.reject(new Error('no space left')),
      list: async () => [],
      load: async () => undefined,
    };
    await expect(prepareDatabase(ctx, { backups: failing })).rejects.toThrow('no space left');
    expect(await pendingMigrationCount(ctx.db)).toBe(1);
    expect(rowsOf(ctx, 'transactions')).toHaveLength(8);
  });

  it('restores the pre-migration backup: same records, natures inferred again', async () => {
    const ctx = await legacyDatabase();
    const store = createTestSnapshotStore();
    const repos = await prepareDatabase(ctx, { backups: store });
    const [preMigration] = await store.list();
    const original = ctx.sqlite.prepare('SELECT id, amount, nature FROM transactions ORDER BY id').all();

    // The user keeps working, then wants the old data back.
    await repos.transactions.remove('salary');
    await repos.transactions.create({ accountId: 'itau', type: 'expense', amount: 1, date: '2026-03-20' });

    const counts = await repos.backup.restoreBackup(preMigration.id);
    expect(counts).toMatchObject({ accounts: 3, transactions: 8 });
    expect(ctx.sqlite.prepare('SELECT id, amount, nature FROM transactions ORDER BY id').all()).toEqual(original);
    expect(await countInconsistentNatures(ctx)).toBe(0);
    // The data replaced by the restore was itself backed up.
    expect((await store.list()).map((b) => b.reason)).toEqual(['pre-restore', 'pre-migration']);
  });
});

describe('export and import', () => {
  async function populated() {
    const ctx = createTestContext();
    const repos = await prepareDatabase(ctx, { backups: createTestSnapshotStore() });
    await repos.accounts.create({ id: 'card', name: 'Cartão', type: 'credit_card', closingDay: 5, dueDay: 12 });
    await repos.transactions.createInstallments({ accountId: 'card', total: 10000, count: 3, firstDate: '2026-03-01' });
    const purchase = await repos.transactions.create({ accountId: 'card', type: 'expense', amount: 5000, date: '2026-03-02' });
    await repos.transactions.createRefund({ refundOfId: purchase.id, amount: 5000, date: '2026-03-03' });
    const gone = await repos.transactions.create({ accountId: 'card', type: 'expense', amount: 77, date: '2026-03-04' });
    await repos.transactions.remove(gone.id);
    await repos.budgets.set('sys-lazer', 30000);
    await repos.settings.set('ui.theme', 'dark');
    return { ctx, repos };
  }

  it('round-trips every table and row, soft-deleted ones included', async () => {
    const source = await populated();
    const json = await source.repos.backup.exportJson();
    const parsed = parseSnapshot(json);
    expect(Object.keys(parsed.tables).sort()).toEqual(['accounts', 'budgets', 'categories', 'settings', 'transactions']);

    const target = createTestContext();
    const targetRepos = await prepareDatabase(target, { backups: createTestSnapshotStore() });
    await targetRepos.backup.importJson(json);

    for (const table of ['accounts', 'categories', 'budgets', 'transactions', 'settings']) {
      expect(rowsOf(target, table)).toEqual(rowsOf(source.ctx, table));
    }
    expect(rowsOf(target, 'transactions').some((r) => r.deleted_at !== null)).toBe(true);
  });

  it('exported files contain no AI keys (they live in the secure store, never in the database)', async () => {
    const { repos } = await populated();
    expect(await repos.backup.exportJson()).not.toMatch(/sk-ant-|sk-proj-|api[_-]?key/i);
  });

  it('rejects invalid files and leaves the data untouched', async () => {
    const { ctx, repos } = await populated();
    const before = rowsOf(ctx, 'transactions');
    await expect(repos.backup.importJson('not json')).rejects.toThrow(ValidationError);
    await expect(repos.backup.importJson(JSON.stringify({ format: 'other' }))).rejects.toThrow(ValidationError);

    const snapshot = JSON.parse(await repos.backup.exportJson());
    const injected = structuredClone(snapshot);
    injected.tables.transactions.columns[0] = 'id"; DROP TABLE accounts; --';
    await expect(repos.backup.importJson(JSON.stringify(injected))).rejects.toThrow(ValidationError);

    const wrongShape = structuredClone(snapshot);
    wrongShape.tables.transactions.rows[0].pop();
    await expect(repos.backup.importJson(JSON.stringify(wrongShape))).rejects.toThrow(ValidationError);

    expect(rowsOf(ctx, 'transactions')).toEqual(before);
  });

  it('a restore that fails midway changes nothing (all or nothing)', async () => {
    const { ctx, repos } = await populated();
    const before = rowsOf(ctx, 'transactions');
    const accountsBefore = rowsOf(ctx, 'accounts');
    const snapshot = JSON.parse(await repos.backup.exportJson());
    // The last table restored has a row breaking a NOT NULL constraint.
    const nameIndex = snapshot.tables.settings.columns.indexOf('value');
    snapshot.tables.settings.rows[0][nameIndex] = null;
    await expect(repos.backup.importJson(JSON.stringify(snapshot))).rejects.toThrow();
    expect(rowsOf(ctx, 'transactions')).toEqual(before);
    expect(rowsOf(ctx, 'accounts')).toEqual(accountsBefore);
  });

  it('takes a snapshot of any schema version', async () => {
    const ctx = await legacyDatabase();
    const snapshot = await takeSnapshot(ctx.db, 'manual', new Date(T));
    expect(snapshot.appliedMigrations).toBe(1);
    expect(snapshot.tables.transactions.columns).not.toContain('nature');
    expect(snapshot.tables.transactions.rows).toHaveLength(8);
  });
});
