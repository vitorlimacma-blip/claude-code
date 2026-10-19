import { rootCategoryIds } from './categories';
import { isTransferNature, resultDelta } from './ledger';
import type { Category, Cents, PaymentMethod, Transaction } from './types';

/** Stands for "Sem categoria" in the category filter. */
export const UNCATEGORIZED = '__sem_categoria__';

/**
 * Filters over a list of transactions. Each dimension is a multi-select; an
 * empty list means "no restriction". Dimensions combine with AND, values
 * within one dimension with OR (e.g. Mercado + Crédito = groceries paid by card).
 */
export interface TransactionFilters {
  /** Top-level category ids (a parent also matches its subcategories) and/or `UNCATEGORIZED`. */
  categoryIds: string[];
  paymentMethods: PaymentMethod[];
  accountIds: string[];
}

export const EMPTY_FILTERS: TransactionFilters = { categoryIds: [], paymentMethods: [], accountIds: [] };

export function activeFilterCount(filters: TransactionFilters): number {
  return filters.categoryIds.length + filters.paymentMethods.length + filters.accountIds.length;
}

/** Adds the value when absent, removes it when present. */
export function toggleValue<T>(values: T[], value: T): T[] {
  return values.includes(value) ? values.filter((v) => v !== value) : [...values, value];
}

export function applyTransactionFilters<
  T extends Pick<Transaction, 'type' | 'nature' | 'categoryId' | 'paymentMethod' | 'accountId'>,
>(
  transactions: T[],
  filters: TransactionFilters,
  categories: Category[]
): T[] {
  if (activeFilterCount(filters) === 0) return transactions;
  const roots = rootCategoryIds(categories);
  const wantedCategories = new Set(filters.categoryIds);
  const wantsUncategorized = wantedCategories.has(UNCATEGORIZED);
  const methods = new Set(filters.paymentMethods);
  const accounts = new Set(filters.accountIds);

  return transactions.filter((t) => {
    if (accounts.size > 0 && !accounts.has(t.accountId)) return false;
    if (methods.size > 0 && !methods.has(t.paymentMethod)) return false;
    if (wantedCategories.size > 0) {
      // Transfers between own accounts have no category by design, so a
      // category filter (even "Sem categoria") never matches them.
      if (isTransferNature(t.nature)) return false;
      if (t.categoryId === null) return wantsUncategorized;
      // A category deleted since is shown as "Sem categoria" in the list.
      const root = roots.get(t.categoryId);
      return root ? wantedCategories.has(root) : wantsUncategorized;
    }
    return true;
  });
}

export interface FilteredSummary {
  count: number;
  /** Incomes minus spending (net of refunds), by the ledger's rules. */
  total: Cents;
  /** Rows that don't change the total: transfers, card payments, investment moves, yields, adjustments. */
  transferCount: number;
}

export function summarizeTransactions(transactions: Pick<Transaction, 'type' | 'nature' | 'amount'>[]): FilteredSummary {
  let total = 0;
  let transferCount = 0;
  for (const t of transactions) {
    const delta = resultDelta(t);
    if (delta === 0) transferCount++;
    total += delta;
  }
  return { count: transactions.length, total, transferCount };
}
