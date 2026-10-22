import { addMonths } from './dates';
import { resultEffect } from './ledger';
import type { Cents, DateKey, MonthKey, Transaction } from './types';

// "Typical" variable spending: what a normal month costs beyond the known
// bills, installments and unusual one-off purchases. Projections use it instead
// of stretching the current month's daily pace, which is misleading right
// after a large purchase or when bills are concentrated (briefing §10).

type Row = Pick<Transaction, 'id' | 'date' | 'amount' | 'type' | 'nature' | 'categoryId' | 'installmentGroupId' | 'deletedAt' | 'description'>;

/** A purchase at least this many times the month's median purchase... */
const ONE_OFF_MEDIAN_FACTOR = 5;
/** ...and at least this share of the month's variable spending counts as a one-off. */
const ONE_OFF_SHARE = 0.1;
export const TYPICAL_MONTHS = 3;

export interface VariableRow {
  id: string;
  date: DateKey;
  /** + for spending, − for a refund. */
  amount: Cents;
  categoryId: string | null;
}

export interface OneOff {
  id: string;
  date: DateKey;
  description: string;
  amount: Cents;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

/**
 * Spending rows that count as variable: expenses and refunds, minus those that
 * settle a known bill (`settledIds`) and installments (already commitments).
 */
export function variableRows(rows: Row[], settledIds: Set<string>): VariableRow[] {
  const out: VariableRow[] = [];
  for (const t of rows) {
    if (t.deletedAt || t.installmentGroupId || settledIds.has(t.id)) continue;
    const effect = resultEffect(t);
    if (effect === 'expense') out.push({ id: t.id, date: t.date, amount: t.amount, categoryId: t.categoryId });
    else if (effect === 'refund_of_expense') out.push({ id: t.id, date: t.date, amount: -t.amount, categoryId: t.categoryId });
  }
  return out;
}

/** Splits a month's variable rows into regular spending and large one-off purchases. */
export function splitOneOffs(rows: VariableRow[], descriptions: Map<string, string> = new Map()): { regular: VariableRow[]; oneOffs: OneOff[] } {
  const purchases = rows.filter((r) => r.amount > 0);
  const total = rows.reduce((s, r) => s + r.amount, 0);
  const typicalPurchase = median(purchases.map((r) => r.amount));
  const isOneOff = (r: VariableRow) =>
    purchases.length >= 5 && r.amount >= typicalPurchase * ONE_OFF_MEDIAN_FACTOR && r.amount >= total * ONE_OFF_SHARE;
  return {
    regular: rows.filter((r) => !isOneOff(r)),
    oneOffs: rows.filter(isOneOff).map((r) => ({ id: r.id, date: r.date, amount: r.amount, description: descriptions.get(r.id) ?? '' })),
  };
}

export interface TypicalSpending {
  /** Complete months used, oldest first. Empty when there is not enough history. */
  months: MonthKey[];
  /** Median variable spending of those months, or null without history. */
  monthly: Cents | null;
  /** Median per key (e.g. top-level category id; null = uncategorized). */
  byKey: Map<string | null, Cents>;
  /** monthly / 30. */
  daily: Cents | null;
  oneOffs: OneOff[];
}

/**
 * Typical monthly variable spending from up to the last 3 complete months
 * before `today`'s month that have data from their start. `keyOf` groups the
 * per-category medians (e.g. by top-level category).
 */
export function typicalSpending(
  rows: Row[],
  settledIds: Set<string>,
  today: DateKey,
  keyOf: (categoryId: string | null) => string | null = (id) => id
): TypicalSpending {
  const live = rows.filter((t) => !t.deletedAt);
  const firstDate = live.reduce<DateKey | null>((min, t) => (min === null || t.date < min ? t.date : min), null);
  const currentMonth = today.slice(0, 7);
  const months: MonthKey[] = [];
  for (let i = 1; months.length < TYPICAL_MONTHS && i <= 12; i++) {
    const month = addMonths(currentMonth, -i);
    // Only months whose start is covered by the data (history beginning on the 20th would undercount).
    if (!firstDate || firstDate > `${month}-03`) break;
    months.unshift(month);
  }
  if (months.length === 0) return { months, monthly: null, byKey: new Map(), daily: null, oneOffs: [] };

  const descriptions = new Map(live.map((t) => [t.id, t.description]));
  const variable = variableRows(live, settledIds);
  const totals: number[] = [];
  const perKey = new Map<string | null, number[]>();
  const oneOffs: OneOff[] = [];
  months.forEach((month, index) => {
    const { regular, oneOffs: found } = splitOneOffs(variable.filter((r) => r.date.startsWith(month)), descriptions);
    oneOffs.push(...found);
    totals.push(regular.reduce((s, r) => s + r.amount, 0));
    const sums = new Map<string | null, number>();
    for (const r of regular) sums.set(keyOf(r.categoryId), (sums.get(keyOf(r.categoryId)) ?? 0) + r.amount);
    for (const [key, sum] of sums) {
      const list = perKey.get(key) ?? new Array(months.length).fill(0);
      list[index] = sum;
      perKey.set(key, list);
    }
  });
  const monthly = Math.max(0, median(totals));
  return {
    months,
    monthly,
    byKey: new Map([...perKey].map(([key, list]) => [key, Math.max(0, median(list))])),
    daily: Math.round(monthly / 30),
    oneOffs,
  };
}

/** Days from `from` to `to`, both inclusive (0 when `to` is before `from`). */
export function daysInclusive(from: DateKey, to: DateKey): number {
  if (to < from) return 0;
  const a = Date.UTC(+from.slice(0, 4), +from.slice(5, 7) - 1, +from.slice(8, 10));
  const b = Date.UTC(+to.slice(0, 4), +to.slice(5, 7) - 1, +to.slice(8, 10));
  return Math.round((b - a) / 86_400_000) + 1;
}
