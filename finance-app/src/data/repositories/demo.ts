import { like, or, sql } from 'drizzle-orm';
import { DEMO_PREFIX, generateDemoData } from '../../domain/demoData';
import { invoiceMonthFor } from '../../domain/ledger';
import { normalizeMerchant } from '../../domain/merchant';
import type { DateKey } from '../../domain/types';
import { type RepositoryContext, timestamp } from '../context';
import { accounts, budgets, recurrences, transactions } from '../schema';

const CHUNK = 50;
const demoId = `${DEMO_PREFIX}%`;

/** Fictitious data for trying the app out; see `src/domain/demoData.ts`. */
export function createDemoRepository(ctx: RepositoryContext) {
  const { db, bus } = ctx;

  async function clearIn(tx: Parameters<Parameters<RepositoryContext['write']>[0]>[0]) {
    // Hard delete: demo rows (and anything the user added to demo accounts) never existed for real.
    await tx.delete(transactions).where(or(like(transactions.id, demoId), like(transactions.accountId, demoId)));
    await tx.delete(budgets).where(like(budgets.id, demoId));
    await tx.delete(recurrences).where(or(like(recurrences.id, demoId), like(recurrences.accountId, demoId)));
    await tx.delete(accounts).where(like(accounts.id, demoId));
  }

  return {
    async exists(): Promise<boolean> {
      const row = await db.select({ n: sql<number>`count(*)` }).from(accounts).where(like(accounts.id, demoId)).get();
      return (row?.n ?? 0) > 0;
    },

    /** Replaces any previous demo data with a fresh set ending at `today`. */
    async generate(today: DateKey): Promise<{ accounts: number; transactions: number }> {
      const data = generateDemoData(today);
      const now = timestamp(ctx);
      const sync = { createdAt: now, updatedAt: now, deletedAt: null };
      await ctx.write(async (tx) => {
        await clearIn(tx);
        await tx.insert(accounts).values(data.accounts.map((a, i) => ({ ...a, ...sync, archived: false, sortOrder: i + 1 })));
        await tx.insert(budgets).values(data.budgets.map((b) => ({ ...b, ...sync, month: null })));
        await tx.insert(recurrences).values(data.recurrences.map((r) => ({ ...r, ...sync, frequency: 'monthly' as const })));
        const accountById = new Map(data.accounts.map((a) => [a.id, a]));
        const rows = data.transactions.map((t) => ({
          ...t,
          ...sync,
          invoiceMonth: t.type === 'expense' ? invoiceMonthFor(accountById.get(t.accountId), t.date) : null,
          merchant: normalizeMerchant(t.description) || null,
          categorySource: t.categoryId ? ('manual' as const) : null,
        }));
        for (let i = 0; i < rows.length; i += CHUNK) {
          await tx.insert(transactions).values(rows.slice(i, i + CHUNK));
        }
      });
      bus.emit('accounts', 'budgets', 'transactions', 'recurrences');
      return { accounts: data.accounts.length, transactions: data.transactions.length };
    },

    async clear(): Promise<void> {
      await ctx.write(clearIn);
      bus.emit('accounts', 'budgets', 'transactions', 'recurrences');
    },
  };
}

export type DemoRepository = ReturnType<typeof createDemoRepository>;
