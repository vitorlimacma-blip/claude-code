import type { AlertLevel, Category, CategoryMonthlyAlert, Transaction } from './types';
import { computeCategoryForecast } from './forecast';

/**
 * Computes the monthly budget alert ("ameaça mensal") for one category.
 * Returns null when the category has no budget configured.
 *
 * Levels, from least to most severe:
 * - ok: on track, under 80% of budget used so far
 * - warning: 80%+ of budget already spent this month
 * - projected_overrun: current pace is projected to exceed the budget by
 *   month end, even though it hasn't been exceeded yet
 * - exceeded: budget already exceeded this month
 */
export function computeMonthlyAlert(
  category: Category,
  categoryTransactions: Transaction[],
  referenceDate: Date
): CategoryMonthlyAlert | null {
  if (category.monthlyBudget === null) return null;

  const budget = category.monthlyBudget;
  const forecast = computeCategoryForecast(
    { categoryId: category.id, categoryName: category.name, transactions: categoryTransactions },
    referenceDate
  );

  const spentSoFar = forecast.monthSpentSoFar;
  const projectedMonthTotal = forecast.projectedMonthTotal;

  const percentOfBudgetUsed = budget > 0 ? spentSoFar / budget : spentSoFar > 0 ? Infinity : 0;
  const percentOfBudgetProjected =
    budget > 0 ? projectedMonthTotal / budget : projectedMonthTotal > 0 ? Infinity : 0;

  let level: AlertLevel;
  if (spentSoFar >= budget) {
    level = 'exceeded';
  } else if (projectedMonthTotal >= budget) {
    level = 'projected_overrun';
  } else if (percentOfBudgetUsed >= 0.8) {
    level = 'warning';
  } else {
    level = 'ok';
  }

  return {
    categoryId: category.id,
    categoryName: category.name,
    level,
    budget,
    spentSoFar,
    projectedMonthTotal,
    percentOfBudgetUsed,
    percentOfBudgetProjected,
  };
}

export function computeAllMonthlyAlerts(
  categories: Category[],
  transactionsByCategory: Map<string, Transaction[]>,
  referenceDate: Date
): CategoryMonthlyAlert[] {
  return categories
    .map((category) => computeMonthlyAlert(category, transactionsByCategory.get(category.id) ?? [], referenceDate))
    .filter((alert): alert is CategoryMonthlyAlert => alert !== null);
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
