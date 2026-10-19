import fs from 'node:fs';
import { DEFAULT_EXPENSE_CATEGORIES, DEFAULT_INCOME_CATEGORIES } from '../../domain/defaultCategories';
import { DEFAULT_ACCOUNT_ID, prepareDatabase } from '../setup';
import { createTestContext } from '../../test-utils/testDb';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { render, outFile } = require('../../../scripts/bundle-migrations.js');

const seededCount = [...DEFAULT_EXPENSE_CATEGORIES, ...DEFAULT_INCOME_CATEGORIES].reduce(
  (n, c) => n + 1 + (c.children?.length ?? 0),
  0
);

describe('bundled migrations', () => {
  it('match the SQL files in drizzle/ (run `npm run db:generate` if this fails)', () => {
    expect(fs.readFileSync(outFile, 'utf8')).toBe(render());
  });
});

describe('prepareDatabase', () => {
  it('creates the schema, the default wallet and the Brazilian categories on a new install', async () => {
    const ctx = createTestContext();
    const repos = await prepareDatabase(ctx);

    const accounts = await repos.accounts.list();
    expect(accounts).toHaveLength(1);
    expect(accounts[0]).toMatchObject({ id: DEFAULT_ACCOUNT_ID, name: 'Carteira', type: 'wallet' });

    const categories = await repos.categories.list();
    expect(categories).toHaveLength(seededCount);
    const mercado = categories.find((c) => c.id === 'sys-alimentacao-mercado');
    expect(mercado).toMatchObject({ parentId: 'sys-alimentacao', kind: 'expense', isSystem: true, color: '#EA580C' });
    expect(categories.find((c) => c.id === 'sys-receita-salario')?.kind).toBe('income');
  });

  it('is idempotent and never resurrects a default category the user deleted', async () => {
    const ctx = createTestContext();
    const repos = await prepareDatabase(ctx);
    await repos.categories.remove('sys-pets');

    const again = await prepareDatabase(ctx);
    const categories = await again.categories.list();
    expect(categories).toHaveLength(seededCount - 1);
    expect(categories.some((c) => c.id === 'sys-pets')).toBe(false);
    expect(await again.accounts.list()).toHaveLength(1);
  });

  it('migrates the data of the first app version (pre-Drizzle schema)', async () => {
    const ctx = createTestContext();
    ctx.sqlite.exec(`
      CREATE TABLE categories (id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, color TEXT NOT NULL,
        monthly_budget INTEGER, created_at TEXT NOT NULL);
      CREATE TABLE transactions (id TEXT PRIMARY KEY NOT NULL,
        category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
        type TEXT NOT NULL CHECK (type IN ('expense', 'income')), amount INTEGER NOT NULL, date TEXT NOT NULL,
        note TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL);
      CREATE INDEX idx_transactions_category ON transactions(category_id);
      CREATE INDEX idx_transactions_date ON transactions(date);
      INSERT INTO categories VALUES ('old-cat', 'Feira', '#ff0000', 30000, '2026-01-01T00:00:00Z');
      INSERT INTO categories VALUES ('old-cat-2', 'Sem orçamento', '#00ff00', NULL, '2026-01-01T00:00:00Z');
      INSERT INTO transactions VALUES ('old-tx', 'old-cat', 'expense', 4590, '2026-02-03', 'banana', '2026-02-03T10:00:00Z');
    `);

    const repos = await prepareDatabase(ctx);

    const feira = await repos.categories.get('old-cat');
    expect(feira).toMatchObject({ name: 'Feira', kind: 'expense', color: '#ff0000', isSystem: false, parentId: null });
    expect((await repos.budgets.amountsForMonth('2026-03')).get('old-cat')).toBe(30000);
    expect((await repos.budgets.amountsForMonth('2026-03')).has('old-cat-2')).toBe(false);

    const tx = await repos.transactions.get('old-tx');
    expect(tx).toMatchObject({
      accountId: DEFAULT_ACCOUNT_ID,
      categoryId: 'old-cat',
      type: 'expense',
      amount: 4590,
      date: '2026-02-03',
      description: 'banana',
      categorySource: 'manual',
    });

    const tables = ctx.sqlite
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'legacy_%'")
      .all();
    expect(tables).toEqual([]);

    // Running again on the migrated database is a no-op.
    const again = await prepareDatabase(ctx);
    expect(await again.transactions.list()).toHaveLength(1);
  });
});
