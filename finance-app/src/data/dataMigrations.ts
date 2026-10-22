import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { defaultNature, inferTransferNature, invoiceMonthFor } from '../domain/ledger';
import type { AccountType, TransactionNature } from '../domain/types';
import type { RepositoryContext } from './context';
import { accounts, settings, transactions } from './schema';

// Data (not schema) migrations: they fill new columns from existing data.
// Each runs once, recorded in `settings`; a restore of an older backup brings
// back the older marker too, so the migration runs again on the restored rows.

const DATA_VERSION_KEY = 'migration.dataVersion';
export const DATA_VERSION = 1;

/**
 * Version 1 (schema migration 0001): gives every existing transaction its
 * nature, by conservative rules (decision D-006):
 * - incomes and expenses keep their plain nature;
 * - a transfer into a credit card is a card payment, into an investment
 *   account an investment contribution, out of one a withdrawal;
 * - any other transfer, or a transfer leg whose pair is missing, stays a transfer.
 * It also fills the invoice month of card purchases that don't have one.
 * `type` is never changed, so the inference can be redone or reverted.
 */
async function toVersion1(ctx: RepositoryContext): Promise<void> {
  await ctx.write(async (tx) => {
    for (const type of ['expense', 'income'] as const) {
      await tx.update(transactions).set({ nature: defaultNature(type) }).where(eq(transactions.type, type));
    }

    const accountRows = await tx.select().from(accounts);
    const accountById = new Map(accountRows.map((a) => [a.id, a]));
    const legs = await tx
      .select({ pairId: transactions.transferPairId, type: transactions.type, accountId: transactions.accountId })
      .from(transactions)
      .where(inArray(transactions.type, ['transfer_out', 'transfer_in']));

    const pairs = new Map<string | null, { from?: AccountType; to?: AccountType; complete: number }>();
    for (const leg of legs) {
      const pair = pairs.get(leg.pairId) ?? { complete: 0 };
      const accountType = accountById.get(leg.accountId)?.type;
      if (leg.type === 'transfer_out') pair.from = accountType;
      else pair.to = accountType;
      pair.complete++;
      pairs.set(leg.pairId, pair);
    }
    for (const [pairId, pair] of pairs) {
      const nature: TransactionNature =
        pairId && pair.complete === 2 && pair.from && pair.to ? inferTransferNature(pair.from, pair.to) : 'transfer';
      await tx
        .update(transactions)
        .set({ nature })
        .where(
          and(
            inArray(transactions.type, ['transfer_out', 'transfer_in']),
            pairId ? eq(transactions.transferPairId, pairId) : isNull(transactions.transferPairId)
          )
        );
    }

    const cards = accountRows.filter((a) => a.type === 'credit_card' && a.closingDay && a.dueDay);
    for (const card of cards) {
      const purchases = await tx
        .select({ id: transactions.id, date: transactions.date })
        .from(transactions)
        .where(and(eq(transactions.accountId, card.id), eq(transactions.type, 'expense'), isNull(transactions.invoiceMonth)));
      for (const p of purchases) {
        await tx
          .update(transactions)
          .set({ invoiceMonth: invoiceMonthFor(card, p.date) })
          .where(eq(transactions.id, p.id));
      }
    }
  });
}

const STEPS: Record<number, (ctx: RepositoryContext) => Promise<void>> = { 1: toVersion1 };

async function currentVersion(ctx: RepositoryContext): Promise<number> {
  const row = await ctx.db.select().from(settings).where(eq(settings.key, DATA_VERSION_KEY)).get();
  const version = row ? Number(JSON.parse(row.value)) : 0;
  return Number.isInteger(version) ? version : 0;
}

/** Runs the data migrations not yet applied. Idempotent: running it again does nothing. */
export async function applyDataMigrations(ctx: RepositoryContext): Promise<number[]> {
  const applied: number[] = [];
  for (let version = (await currentVersion(ctx)) + 1; version <= DATA_VERSION; version++) {
    await STEPS[version](ctx);
    const value = JSON.stringify(version);
    const updatedAt = ctx.now().toISOString();
    await ctx.write((tx) =>
      tx.insert(settings).values({ key: DATA_VERSION_KEY, value, updatedAt }).onConflictDoUpdate({
        target: settings.key,
        set: { value, updatedAt },
      })
    );
    applied.push(version);
  }
  if (applied.length > 0) ctx.bus.emit('transactions', 'settings');
  return applied;
}

/** Live transactions whose nature doesn't match their type: should always be zero. */
export async function countInconsistentNatures(ctx: RepositoryContext): Promise<number> {
  const [row] = await ctx.db.all<[number]>(sql`SELECT count(*) FROM transactions WHERE deleted_at IS NULL AND (
    (type = 'expense' AND nature NOT IN ('expense', 'investment_return', 'refund', 'adjustment')) OR
    (type = 'income' AND nature NOT IN ('income', 'investment_return', 'refund', 'adjustment')) OR
    (type IN ('transfer_out', 'transfer_in') AND nature NOT IN ('transfer', 'card_payment', 'investment_contribution', 'investment_withdrawal'))
  )`);
  return row?.[0] ?? 0;
}

