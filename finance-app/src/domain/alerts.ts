import type { AlertLevel, Cents, CategoryMonthlyAlert } from './types';
import { computeCategoryForecast, type TransactionAmount } from './forecast';

export interface MonthlyAlertInput {
  categoryId: string;
  categoryName: string;
  budget: Cents;
  /** Transactions of this category (and its subcategories); any date range, will be filtered. */
  transactions: TransactionAmount[];
}

/**
 * Computes the monthly budget alert ("ameaça mensal") for one category.
 *
 * Levels, from least to most severe:
 * - ok: on track, under 80% of budget used so far
 * - warning: 80%+ of budget already spent this month
 * - projected_overrun: current pace is projected to exceed the budget by
 *   month end, even though it hasn't been exceeded yet
 * - exceeded: budget already exceeded this month
 */
export function computeMonthlyAlert(input: MonthlyAlertInput, referenceDate: Date): CategoryMonthlyAlert {
  const { budget } = input;
  const forecast = computeCategoryForecast(
    { categoryId: input.categoryId, categoryName: input.categoryName, transactions: input.transactions },
    referenceDate
  );

  const spentSoFar = forecast.monthSpentSoFar;
  const projectedMonthTotal = forecast.projectedMonthTotal;

  const percentOfBudgetUsed = budget > 0 ? spentSoFar / budget : spentSoFar > 0 ? Infinity : 0;
  const percentOfBudgetProjected =
    budget > 0 ? projectedMonthTotal / budget : projectedMonthTotal > 0 ? Infinity : 0;

  let level: AlertLevel;
  if (spentSoFar >= budget && (budget > 0 || spentSoFar > 0)) {
    level = 'exceeded';
  } else if (projectedMonthTotal >= budget && projectedMonthTotal > 0) {
    level = 'projected_overrun';
  } else if (percentOfBudgetUsed >= 0.8) {
    level = 'warning';
  } else {
    level = 'ok';
  }

  return {
    categoryId: input.categoryId,
    categoryName: input.categoryName,
    level,
    budget,
    spentSoFar,
    projectedMonthTotal,
    percentOfBudgetUsed,
    percentOfBudgetProjected,
  };
}

const SEVERITY_ORDER: Record<AlertLevel, number> = {
  ok: 0,
  warning: 1,
  projected_overrun: 2,
  exceeded: 3,
};

/** Sorts alerts most severe first, useful for a dashboard "threats" list. */
export function sortBySeverityDesc(alerts: CategoryMonthlyAlert[]): CategoryMonthlyAlert[] {
  return [...alerts].sort((a, b) => SEVERITY_ORDER[b.level] - SEVERITY_ORDER[a.level]);
}
