import type { Cents, Transaction } from './types';
import { daysInMonth, daysInYear, dayOfYear, startOfMonthKey, startOfYearKey, toDateKey } from '../utils/date';

export function sumCents(transactions: Transaction[]): Cents {
  return transactions.reduce((total, t) => total + t.amount, 0);
}

export function transactionsInRange(
  transactions: Transaction[],
  startKeyInclusive: string,
  endKeyInclusive: string
): Transaction[] {
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
  /** All expense transactions for this category (any date range is fine; will be filtered). */
  transactions: Transaction[];
}

/**
 * Computes daily/monthly/annual expense forecasts for one category, as of
 * `referenceDate`, using a run-rate projection based on spend-so-far.
 */
export function computeCategoryForecast(
  input: CategoryForecastInput,
  referenceDate: Date
): {
  categoryId: string;
  categoryName: string;
  dailyAverage: Cents;
  monthSpentSoFar: Cents;
  projectedMonthTotal: Cents;
  yearSpentSoFar: Cents;
  projectedYearTotal: Cents;
} {
  const expenses = input.transactions.filter((t) => t.type === 'expense');

  const todayKey = toDateKey(referenceDate);
  const monthKey = startOfMonthKey(referenceDate);
  const yearKey = startOfYearKey(referenceDate);

  const daysElapsedInMonth = referenceDate.getDate();
  const totalDaysInMonth = daysInMonth(referenceDate.getFullYear(), referenceDate.getMonth());
  const daysElapsedInYear = dayOfYear(referenceDate);
  const totalDaysInYear = daysInYear(referenceDate.getFullYear());

  const monthSpentSoFar = sumCents(transactionsInRange(expenses, monthKey, todayKey));
  const yearSpentSoFar = sumCents(transactionsInRange(expenses, yearKey, todayKey));

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
