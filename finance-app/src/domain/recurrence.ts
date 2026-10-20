import { addDaysToDateKey, addMonths, dayOfMonthKey } from './dates';
import { resultEffect } from './ledger';
import { normalizeMerchant } from './merchant';
import type { Cents, DateKey, PaymentMethod, Recurrence, Transaction } from './types';

// Expected bills and incomes ("contas fixas", salary), their occurrences in a
// period, and how each occurrence is reconciled with what was recorded, so a
// commitment already paid is never counted again (briefing §10, §16).

export interface Occurrence {
  recurrence: Recurrence;
  /** Due date. */
  date: DateKey;
}

/** Due dates of a recurrence between `from` and `to` (inclusive). */
export function occurrencesBetween(rec: Pick<Recurrence, 'frequency' | 'dayOfMonth' | 'monthOfYear' | 'startDate' | 'endDate'>, from: DateKey, to: DateKey): DateKey[] {
  const dates: DateKey[] = [];
  const lo = from > rec.startDate ? from : rec.startDate;
  const hi = rec.endDate && rec.endDate < to ? rec.endDate : to;
  if (lo > hi) return dates;
  for (let month = lo.slice(0, 7); month <= hi.slice(0, 7); month = addMonths(month, 1)) {
    if (rec.frequency === 'yearly' && Number(month.slice(5, 7)) !== rec.monthOfYear) continue;
    const date = dayOfMonthKey(month, rec.dayOfMonth);
    if (date >= lo && date <= hi) dates.push(date);
  }
  return dates;
}

/** How far from the due date a transaction may be and still settle the occurrence. */
export const MATCH_WINDOW_DAYS = 7;
/** How far the amount may differ from the expected one (bills vary: energy, water...). */
export const MATCH_AMOUNT_TOLERANCE = 0.3;

type Candidate = Pick<Transaction, 'id' | 'date' | 'amount' | 'type' | 'nature' | 'categoryId' | 'description' | 'merchant' | 'recurrenceId' | 'deletedAt'>;

function sameText(rec: Pick<Recurrence, 'description'>, t: Pick<Transaction, 'description' | 'merchant'>): boolean {
  const a = normalizeMerchant(rec.description);
  const b = t.merchant ?? normalizeMerchant(t.description);
  if (!a || !b) return false;
  return a === b || a.startsWith(b) || b.startsWith(a);
}

/**
 * Matches occurrences with the transactions that settled them. A transaction
 * linked explicitly (`recurrenceId`) always wins; otherwise one of the same
 * direction, within ±7 days and ±30% of the amount, and with the same category
 * or the same merchant, settles it. Each transaction settles one occurrence at most.
 */
export function reconcile(occurrences: Occurrence[], transactions: Candidate[]): Map<Occurrence, Candidate> {
  const result = new Map<Occurrence, Candidate>();
  const used = new Set<string>();
  const live = transactions.filter((t) => !t.deletedAt);
  const ordered = [...occurrences].sort((a, b) => a.date.localeCompare(b.date));

  // Explicit links first, nearest date.
  for (const occ of ordered) {
    const linked = live
      .filter((t) => t.recurrenceId === occ.recurrence.id && !used.has(t.id) && Math.abs(daysBetween(t.date, occ.date)) <= 20)
      .sort((a, b) => Math.abs(daysBetween(a.date, occ.date)) - Math.abs(daysBetween(b.date, occ.date)))[0];
    if (linked) {
      result.set(occ, linked);
      used.add(linked.id);
    }
  }
  for (const occ of ordered) {
    if (result.has(occ)) continue;
    const rec = occ.recurrence;
    const effect = rec.kind === 'expense' ? 'expense' : 'income';
    const match = live
      .filter(
        (t) =>
          !used.has(t.id) &&
          !t.recurrenceId &&
          resultEffect(t) === effect &&
          Math.abs(daysBetween(t.date, occ.date)) <= MATCH_WINDOW_DAYS &&
          Math.abs(t.amount - rec.amount) <= rec.amount * MATCH_AMOUNT_TOLERANCE &&
          ((rec.categoryId !== null && t.categoryId === rec.categoryId) || sameText(rec, t))
      )
      .sort((a, b) => Math.abs(daysBetween(a.date, occ.date)) - Math.abs(daysBetween(b.date, occ.date)))[0];
    if (match) {
      result.set(occ, match);
      used.add(match.id);
    }
  }
  return result;
}

function daysBetween(a: DateKey, b: DateKey): number {
  return Math.round((Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10)) - Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10))) / 86_400_000);
}

/** Every occurrence of the given recurrences between two dates, sorted by date. */
export function allOccurrences(recurrences: Recurrence[], from: DateKey, to: DateKey): Occurrence[] {
  return recurrences
    .filter((r) => !r.deletedAt)
    .flatMap((recurrence) => occurrencesBetween(recurrence, from, to).map((date) => ({ recurrence, date })))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** Ids of transactions that settle some occurrence (used to keep them out of variable-spending estimates). */
export function settledTransactionIds(recurrences: Recurrence[], transactions: Candidate[], from: DateKey, to: DateKey): Set<string> {
  const occurrences = allOccurrences(recurrences, addDaysToDateKey(from, -MATCH_WINDOW_DAYS), addDaysToDateKey(to, MATCH_WINDOW_DAYS));
  return new Set([...reconcile(occurrences, transactions).values()].map((t) => t.id));
}

export interface RecurrenceSuggestion {
  kind: 'expense' | 'income';
  description: string;
  /** Median of the amounts seen. */
  amount: Cents;
  dayOfMonth: number;
  accountId: string;
  categoryId: string | null;
  paymentMethod: PaymentMethod;
  /** Months (of the last four complete ones) in which it appeared. */
  months: number;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

/**
 * Bills and incomes that look monthly in the history: the same merchant in at
 * least 3 of the last 4 complete months, with amounts within ±20% of their
 * median and days within ±5 of theirs. Only suggested; the user confirms each.
 */
export function suggestRecurrences(
  history: Pick<Transaction, 'date' | 'amount' | 'type' | 'nature' | 'description' | 'merchant' | 'accountId' | 'categoryId' | 'paymentMethod' | 'deletedAt' | 'installmentGroupId' | 'transferPairId'>[],
  existing: Pick<Recurrence, 'description' | 'deletedAt'>[],
  today: DateKey
): RecurrenceSuggestion[] {
  const currentMonth = today.slice(0, 7);
  const months = [1, 2, 3, 4].map((i) => addMonths(currentMonth, -i));
  const known = new Set(existing.filter((r) => !r.deletedAt).map((r) => normalizeMerchant(r.description)));
  const groups = new Map<string, typeof history>();
  for (const t of history) {
    if (t.deletedAt || t.installmentGroupId || t.transferPairId) continue;
    const effect = resultEffect(t);
    if (effect !== 'expense' && effect !== 'income') continue;
    if (!months.includes(t.date.slice(0, 7))) continue;
    const merchant = t.merchant ?? normalizeMerchant(t.description);
    if (!merchant || known.has(merchant)) continue;
    const key = `${effect}|${merchant}`;
    groups.set(key, [...(groups.get(key) ?? []), t]);
  }
  const suggestions: RecurrenceSuggestion[] = [];
  for (const [key, rows] of groups) {
    const byMonth = new Map<string, (typeof rows)[number]>();
    // One row per month (the largest), so several purchases at the same store don't look like a bill.
    for (const t of rows) {
      const m = t.date.slice(0, 7);
      const prev = byMonth.get(m);
      if (!prev || t.amount > prev.amount) byMonth.set(m, t);
    }
    if (byMonth.size < 3 || rows.length > byMonth.size + 1) continue;
    const picked = [...byMonth.values()];
    const amount = median(picked.map((t) => t.amount));
    const day = median(picked.map((t) => Number(t.date.slice(8, 10))));
    if (!picked.every((t) => Math.abs(t.amount - amount) <= amount * 0.2 && Math.abs(Number(t.date.slice(8, 10)) - day) <= 5)) continue;
    const latest = picked.sort((a, b) => b.date.localeCompare(a.date))[0];
    suggestions.push({
      kind: key.startsWith('income') ? 'income' : 'expense',
      description: latest.description.trim() || (latest.merchant ?? ''),
      amount,
      dayOfMonth: day,
      accountId: latest.accountId,
      categoryId: latest.categoryId,
      paymentMethod: latest.paymentMethod,
      months: byMonth.size,
    });
  }
  return suggestions.sort((a, b) => (a.kind === b.kind ? b.amount - a.amount : a.kind === 'income' ? -1 : 1));
}
