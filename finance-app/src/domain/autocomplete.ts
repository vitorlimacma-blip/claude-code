import { normalizeSearch } from './transactionFilters';
import type { Cents, DateKey, PaymentMethod, Transaction, TransactionType } from './types';

/** What a past transaction suggests when its description is typed again. */
export interface DescriptionSuggestion {
  description: string;
  categoryId: string | null;
  accountId: string;
  paymentMethod: PaymentMethod;
  /** Amount of the latest use, shown as a hint only; never filled in automatically. */
  lastAmount: Cents;
  lastDate: DateKey;
  count: number;
}

/**
 * Past descriptions matching what is being typed, for autocomplete (§8).
 * Matches the start of the description or of any word in it; the most used
 * and most recent come first. Each suggestion carries the latest category,
 * account and payment method used with it.
 */
export function descriptionSuggestions(
  history: Pick<Transaction, 'description' | 'categoryId' | 'accountId' | 'paymentMethod' | 'amount' | 'date' | 'type' | 'nature' | 'deletedAt'>[],
  typed: string,
  type: Extract<TransactionType, 'expense' | 'income'>,
  limit = 5
): DescriptionSuggestion[] {
  const query = normalizeSearch(typed);
  if (query.length < 2) return [];
  const byKey = new Map<string, DescriptionSuggestion & { startsWith: boolean }>();
  for (const t of history) {
    if (t.deletedAt || t.type !== type || (t.nature !== 'expense' && t.nature !== 'income')) continue;
    const description = t.description.trim();
    const key = normalizeSearch(description);
    if (!key || key === query) continue;
    const startsWith = key.startsWith(query);
    if (!startsWith && !key.split(' ').some((word) => word.startsWith(query))) continue;
    const current = byKey.get(key);
    if (!current) {
      byKey.set(key, {
        description,
        categoryId: t.categoryId,
        accountId: t.accountId,
        paymentMethod: t.paymentMethod,
        lastAmount: t.amount,
        lastDate: t.date,
        count: 1,
        startsWith,
      });
    } else {
      current.count++;
      if (t.date > current.lastDate) {
        Object.assign(current, { categoryId: t.categoryId, accountId: t.accountId, paymentMethod: t.paymentMethod, lastAmount: t.amount, lastDate: t.date });
      }
    }
  }
  return [...byKey.values()]
    .sort((a, b) => Number(b.startsWith) - Number(a.startsWith) || b.count - a.count || b.lastDate.localeCompare(a.lastDate))
    .slice(0, limit)
    .map(({ startsWith: _s, ...rest }) => rest);
}

/** Account of the most recent income or expense, to suggest (not silently force) in a new entry. */
export function lastUsedAccountId(
  history: Pick<Transaction, 'accountId' | 'date' | 'createdAt' | 'type' | 'deletedAt'>[],
  liveAccountIds: Set<string>
): string | null {
  let best: (typeof history)[number] | null = null;
  for (const t of history) {
    if (t.deletedAt || (t.type !== 'expense' && t.type !== 'income') || !liveAccountIds.has(t.accountId)) continue;
    if (!best || t.createdAt > best.createdAt) best = t;
  }
  return best?.accountId ?? null;
}
