import type { Cents, ForecastPoint, Transaction } from './types';
import { daysInMonth, daysInYear, dayOfYear, startOfMonthKey, startOfYearKey, toDateKey } from './dates';
import { netExpenses } from './ledger';

/** The only transaction fields forecasts look at, so callers (and tests) can pass partial rows. */
export type TransactionAmount = Pick<Transaction, 'type' | 'nature' | 'amount' | 'date'>;

export function sumCents(transactions: TransactionAmount[]): Cents {
  return transactions.reduce((total, t) => total + t.amount, 0);
}

export function transactionsInRange<T extends TransactionAmount>(
  transactions: T[],
  startKeyInclusive: string,
  endKeyInclusive: string
): T[] {
  return transactions.filter((t) => t.date >= startKeyInclusive && t.date <= endKeyInclusive);
}

/**
 * Projects a full-period total from a partial-period total, assuming the
 * spending rate observed so far continues for the rest of the period
 * ("run-rate" projection). Returns 0 when there is no elapsed time yet.
 */
export function projectByRunRate(totalSoFar: Cents, daysElapsed: number, daysInPeriod: number): Cents {
  if (daysElapsed <= 0) return 0;
  return Math.round((totalSoFar / daysElapsed) * daysInPeriod);
}

export interface CategoryForecastInput {
  categoryId: string;
  categoryName: string;
  /** Transactions of this category (any date range and nature; only spending net of refunds counts). */
  transactions: TransactionAmount[];
}

/**
 * Computes daily/monthly/annual expense forecasts for one category, as of
 * `referenceDate`, using a run-rate projection based on spend-so-far.
 */
export function computeCategoryForecast(
  input: CategoryForecastInput,
  referenceDate: Date
): ForecastPoint {
  const todayKey = toDateKey(referenceDate);
  const monthKey = startOfMonthKey(referenceDate);
  const yearKey = startOfYearKey(referenceDate);

  const daysElapsedInMonth = referenceDate.getDate();
  const totalDaysInMonth = daysInMonth(referenceDate.getFullYear(), referenceDate.getMonth());
  const daysElapsedInYear = dayOfYear(referenceDate);
  const totalDaysInYear = daysInYear(referenceDate.getFullYear());

  const monthSpentSoFar = netExpenses(transactionsInRange(input.transactions, monthKey, todayKey));
  const yearSpentSoFar = netExpenses(transactionsInRange(input.transactions, yearKey, todayKey));

  const dailyAverage = daysElapsedInMonth > 0 ? Math.round(monthSpentSoFar / daysElapsedInMonth) : 0;
  const projectedMonthTotal = projectByRunRate(monthSpentSoFar, daysElapsedInMonth, totalDaysInMonth);
  const projectedYearTotal = projectByRunRate(yearSpentSoFar, daysElapsedInYear, totalDaysInYear);

  return {
    categoryId: input.categoryId,
    categoryName: input.categoryName,
    dailyAverage,
    monthSpentSoFar,
    projectedMonthTotal,
    yearSpentSoFar,
    projectedYearTotal,
  };
}
