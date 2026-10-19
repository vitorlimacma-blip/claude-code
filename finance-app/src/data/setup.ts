import { sql } from 'drizzle-orm';
import { DEFAULT_CATEGORIES, DEFAULT_CATEGORIES_VERSION } from '../domain/defaultCategories';
import { CATEGORY_KINDS } from '../domain/types';
import { appliedMigrationCount, type SnapshotStore, snapshotHasData, takeSnapshot } from './backup';
import type { AppDatabase, RepositoryContext } from './context';
import { applyDataMigrations } from './dataMigrations';
import bundledMigrations from './migrations.generated';
import { createRepositories, type Repositories } from './repositories';
import { accounts, budgets, categories, transactions } from './schema';

export const DEFAULT_ACCOUNT_ID = 'sys-carteira';
const SEED_VERSION_KEY = 'seed.categoriesVersion';

/**
 * Brings any database (new, legacy or current) to the latest schema and makes
 * sure the default data exists. Storage-agnostic: the app calls it with
 * expo-sqlite, tests with node:sqlite.
 *
 * When a schema migration is pending and there is data, a complete backup is
 * saved in `backups` first; if that fails, nothing is migrated.
 */
export async function prepareDatabase(
  ctx: RepositoryContext,
  options: { backups?: SnapshotStore } = {}
): Promise<Repositories> {
  if (options.backups && (await pendingMigrationCount(ctx.db)) > 0) {
    const snapshot = await takeSnapshot(ctx.db, 'pre-migration', ctx.now());
    if (snapshotHasData(snapshot)) await options.backups.save(snapshot);
  }

  const hadLegacySchema = await renameLegacyTables(ctx.db);
  await migrate(ctx.db);

  const repos = createRepositories(ctx, options);
  await seedDefaults(ctx, repos);
  if (hadLegacySchema) await importLegacyData(ctx);
  await applyDataMigrations(ctx);
  return repos;
}

export async function pendingMigrationCount(db: AppDatabase): Promise<number> {
  return bundledMigrations.journal.entries.length - (await appliedMigrationCount(db));
}

/**
 * Applies the migrations bundled in `migrations.generated.ts` that haven't run
 * yet, tracked in Drizzle's standard `__drizzle_migrations` table. Mirrors
 * Drizzle's own expo migrator, but for the async driver the app uses.
 * `upTo` (tests only) stops after that many migrations, to build older schemas.
 */
export async function migrate(db: AppDatabase, upTo?: number): Promise<void> {
  const { journal, migrations } = bundledMigrations;
  const queries = journal.entries.slice(0, upTo).map((entry) => {
    const source = migrations[`m${String(entry.idx).padStart(4, '0')}`];
    if (!source) throw new Error(`Missing migration: ${entry.tag}`);
    return { sql: source.split('--> statement-breakpoint'), bps: entry.breakpoints, folderMillis: entry.when, hash: '' };
  });
  // `dialect` and `session` are Drizzle internals, which is how its own migrators reach them.
  const internals = db as unknown as {
    dialect: { migrate: (m: typeof queries, session: unknown) => Promise<void> };
    session: unknown;
  };
  await internals.dialect.migrate(queries, internals.session);
}

async function tableExists(db: AppDatabase, name: string): Promise<boolean> {
  const rows = await db.all(sql`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ${name}`);
  return rows.length > 0;
}

/**
 * Detects the schema of the app's first version (tables created by hand,
 * before Drizzle) and moves it out of the way so migrations can create the
 * new tables; its rows are copied over by `importLegacyData`.
 */
async function renameLegacyTables(db: AppDatabase): Promise<boolean> {
  if ((await tableExists(db, '__drizzle_migrations')) || !(await tableExists(db, 'categories'))) return false;
  await db.run(sql.raw('DROP INDEX IF EXISTS idx_transactions_category'));
  await db.run(sql.raw('DROP INDEX IF EXISTS idx_transactions_date'));
  await db.run(sql.raw('ALTER TABLE categories RENAME TO legacy_categories'));
  if (await tableExists(db, 'transactions')) {
    await db.run(sql.raw('ALTER TABLE transactions RENAME TO legacy_transactions'));
  }
  return true;
}

async function importLegacyData(ctx: RepositoryContext): Promise<void> {
  const now = ctx.now().toISOString();
  await ctx.write(async (tx) => {
    // Raw queries return rows as arrays, in the order of the selected columns.
    const legacyCategories = await tx.all<[string, string, string, number | null, string]>(
      sql.raw('SELECT id, name, color, monthly_budget, created_at FROM legacy_categories')
    );
    const legacyTransactions = (await tableExists(tx, 'legacy_transactions'))
      ? await tx.all<[string, string, 'expense' | 'income', number, string, string, string]>(
          sql.raw('SELECT id, category_id, type, amount, date, note, created_at FROM legacy_transactions')
        )
      : [];

    for (const [id, name, color, monthlyBudget, createdAt] of legacyCategories) {
      await tx
        .insert(categories)
        .values({
          id,
          parentId: null,
          name,
          kind: 'expense',
          color,
          icon: 'pricetag-outline',
          isSystem: false,
          sortOrder: 1000,
          createdAt,
          updatedAt: now,
          deletedAt: null,
        })
        .onConflictDoNothing();
      if (monthlyBudget !== null) {
        await tx.insert(budgets).values({
          id: ctx.newId(),
          categoryId: id,
          month: null,
          amount: monthlyBudget,
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
        });
      }
    }
    for (const [id, categoryId, type, amount, date, note, createdAt] of legacyTransactions) {
      await tx
        .insert(transactions)
        .values({
          id,
          accountId: DEFAULT_ACCOUNT_ID,
          categoryId,
          type,
          amount,
          date,
          description: note,
          notes: '',
          categorySource: 'manual',
          createdAt,
          updatedAt: now,
          deletedAt: null,
        })
        .onConflictDoNothing();
    }
    await tx.run(sql.raw('DROP TABLE IF EXISTS legacy_transactions'));
    await tx.run(sql.raw('DROP TABLE legacy_categories'));
  });
  ctx.bus.emit('categories', 'budgets', 'transactions');
}

/**
 * Creates the default wallet account and the Brazilian default categories.
 * Runs once per `DEFAULT_CATEGORIES_VERSION`; only inserts ids that don't
 * exist yet (live or deleted), so it never resurrects what the user removed.
 */
async function seedDefaults(ctx: RepositoryContext, repos: Repositories): Promise<void> {
  const seeded = await repos.settings.get<number>(SEED_VERSION_KEY, 0);
  if (seeded >= DEFAULT_CATEGORIES_VERSION) return;
  const now = ctx.now().toISOString();

  await ctx.write(async (tx) => {
    const existingIds = new Set((await tx.select({ id: categories.id }).from(categories)).map((r) => r.id));

    if (seeded === 0) {
      await tx
        .insert(accounts)
        .values({
          id: DEFAULT_ACCOUNT_ID,
          name: 'Carteira',
          type: 'wallet',
          institution: null,
          color: '#16A34A',
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoNothing();
    }

    const rows: (typeof categories.$inferInsert)[] = [];
    for (const kind of CATEGORY_KINDS) {
      DEFAULT_CATEGORIES[kind].forEach((parent, parentIndex) => {
        const common = { kind, color: parent.color, isSystem: true, createdAt: now, updatedAt: now };
        rows.push({ ...common, id: parent.id, parentId: null, name: parent.name, icon: parent.icon, sortOrder: parentIndex });
        (parent.children ?? []).forEach((child, childIndex) =>
          rows.push({
            ...common,
            id: child.id,
            parentId: parent.id,
            name: child.name,
            icon: child.icon ?? parent.icon,
            sortOrder: childIndex,
          })
        );
      });
    }
    const missing = rows.filter((r) => !existingIds.has(r.id));
    if (missing.length > 0) await tx.insert(categories).values(missing);
  });

  await repos.settings.set(SEED_VERSION_KEY, DEFAULT_CATEGORIES_VERSION);
  ctx.bus.emit('accounts', 'categories');
}
