import { and, eq, isNull } from 'drizzle-orm';
import type { Budget, Cents, MonthKey } from '../../domain/types';
import { type RepositoryContext, timestamp, ValidationError } from '../context';
import { budgets } from '../schema';

export function createBudgetsRepository(ctx: RepositoryContext) {
  const { db, bus } = ctx;

  return {
    async list(): Promise<Budget[]> {
      return db.select().from(budgets).where(isNull(budgets.deletedAt));
    },

    /**
     * Budget amount per category for `month`: a budget set for that specific
     * month wins over the category's default (month = null) budget.
     */
    async amountsForMonth(month: MonthKey): Promise<Map<string, Cents>> {
      const rows = await db.select().from(budgets).where(isNull(budgets.deletedAt));
      const result = new Map<string, Cents>();
      for (const row of rows) if (row.month === null) result.set(row.categoryId, row.amount);
      for (const row of rows) if (row.month === month) result.set(row.categoryId, row.amount);
      return result;
    },

    /**
     * Sets (or clears, with `amount = null`) a category's budget, either the
     * default for every month (`month = null`) or an override for one month.
     */
    async set(categoryId: string, amount: Cents | null, month: MonthKey | null = null): Promise<void> {
      if (amount !== null && (!Number.isInteger(amount) || amount < 0)) {
        throw new ValidationError('O orçamento deve ser um valor positivo.');
      }
      const now = timestamp(ctx);
      const changed = await ctx.write(async (tx) => {
        const existing = await tx
          .select()
          .from(budgets)
          .where(
            and(
              eq(budgets.categoryId, categoryId),
              month === null ? isNull(budgets.month) : eq(budgets.month, month),
              isNull(budgets.deletedAt)
            )
          )
          .get();
        if (existing && amount === null) {
          await tx.update(budgets).set({ deletedAt: now, updatedAt: now }).where(eq(budgets.id, existing.id));
        } else if (existing && amount !== null) {
          await tx.update(budgets).set({ amount, updatedAt: now }).where(eq(budgets.id, existing.id));
        } else if (amount !== null) {
          await tx
            .insert(budgets)
            .values({ id: ctx.newId(), categoryId, month, amount, createdAt: now, updatedAt: now, deletedAt: null });
        } else {
          return false;
        }
        return true;
      });
      if (changed) bus.emit('budgets');
    },
  };
}

export type BudgetsRepository = ReturnType<typeof createBudgetsRepository>;
