import { rootCategoryIds } from './categories';
import { isTransferNature, resultDelta } from './ledger';
import type { Account, Category, Cents, PaymentMethod, Transaction, TransactionNature } from './types';

/** Stands for "Sem categoria" in the category filter. */
export const UNCATEGORIZED = '__sem_categoria__';

/** Natures as the user filters them: investment moves and yields together, for instance. */
export const NATURE_GROUPS = ['expense', 'income', 'transfer', 'card_payment', 'investment', 'refund', 'adjustment'] as const;
export type NatureGroup = (typeof NATURE_GROUPS)[number];

export const NATURE_GROUP_LABELS: Record<NatureGroup, string> = {
  expense: 'Despesas',
  income: 'Receitas',
  transfer: 'Transferências',
  card_payment: 'Pagamentos de fatura',
  investment: 'Investimentos',
  refund: 'Estornos',
  adjustment: 'Ajustes de saldo',
};

export function natureGroup(nature: TransactionNature): NatureGroup {
  switch (nature) {
    case 'investment_contribution':
    case 'investment_withdrawal':
    case 'investment_return':
      return 'investment';
    default:
      return nature;
  }
}

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
  natureGroups: NatureGroup[];
  /** Free text matched against description, merchant, notes, category and account names. */
  query: string;
}

export const EMPTY_FILTERS: TransactionFilters = {
  categoryIds: [],
  paymentMethods: [],
  accountIds: [],
  natureGroups: [],
  query: '',
};

/** Filters chosen in the filter sheet (the search text is shown apart). */
export function activeFilterCount(filters: TransactionFilters): number {
  return filters.categoryIds.length + filters.paymentMethods.length + filters.accountIds.length + filters.natureGroups.length;
}

/** Lowercase, without accents or extra spaces, for searching. */
export function normalizeSearch(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Adds the value when absent, removes it when present. */
export function toggleValue<T>(values: T[], value: T): T[] {
  return values.includes(value) ? values.filter((v) => v !== value) : [...values, value];
}

export function applyTransactionFilters<
  T extends Pick<Transaction, 'type' | 'nature' | 'categoryId' | 'paymentMethod' | 'accountId'> &
    Partial<Pick<Transaction, 'description' | 'merchant' | 'notes'>>,
>(
  transactions: T[],
  filters: TransactionFilters,
  categories: Category[],
  accounts: Pick<Account, 'id' | 'name'>[] = []
): T[] {
  const words = normalizeSearch(filters.query ?? '').split(' ').filter(Boolean);
  if (activeFilterCount(filters) === 0 && words.length === 0) return transactions;
  const roots = rootCategoryIds(categories);
  const categoryName = new Map(categories.map((c) => [c.id, c.name]));
  const accountName = new Map(accounts.map((a) => [a.id, a.name]));
  const groups = new Set(filters.natureGroups ?? []);
  const wantedCategories = new Set(filters.categoryIds);
  const wantsUncategorized = wantedCategories.has(UNCATEGORIZED);
  const methods = new Set(filters.paymentMethods);
  const accountIds = new Set(filters.accountIds);

  return transactions.filter((t) => {
    if (accountIds.size > 0 && !accountIds.has(t.accountId)) return false;
    if (groups.size > 0 && !groups.has(natureGroup(t.nature))) return false;
    if (words.length > 0) {
      const category = t.categoryId ? categoryName.get(t.categoryId) : undefined;
      const parent = t.categoryId ? categoryName.get(roots.get(t.categoryId) ?? '') : undefined;
      const haystack = normalizeSearch(
        [t.description, t.merchant, t.notes, category, parent, accountName.get(t.accountId)].filter(Boolean).join(' ')
      );
      if (!words.every((w) => haystack.includes(w))) return false;
    }
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
