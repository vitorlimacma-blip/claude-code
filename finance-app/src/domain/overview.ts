import { computeMonthlyAlert, sortBySeverityDesc } from './alerts';
import { groupByCategoryTree } from './categories';
import { fromDateKey } from './dates';
import { computeCategoryForecast, sumCents } from './forecast';
import type { Category, CategoryMonthlyAlert, Cents, DateKey, ForecastPoint, Transaction } from './types';

export interface MonthOverview {
  spent: Cents;
  income: Cents;
  /** income - spent; transfers between own accounts don't count. */
  balance: Cents;
  uncategorizedCount: number;
  /** One alert per category that has a budget, most severe first. */
  alerts: CategoryMonthlyAlert[];
  /** Forecast per top-level expense category with spending this year, biggest projection first. */
  forecasts: ForecastPoint[];
}

/**
 * Everything the dashboard and the forecasts screen show, from the year's
 * transactions up to `today`.
 *
 * @param transactions transactions from Jan 1st of today's year up to today
 * @param budgets budget per category id for today's month
 */
export function buildMonthOverview(input: {
  categories: Category[];
  budgets: Map<string, Cents>;
  transactions: Transaction[];
  today: DateKey;
}): MonthOverview {
  const { categories, budgets, transactions, today } = input;
  const referenceDate = fromDateKey(today);
  const monthPrefix = today.slice(0, 7);

  const monthTx = transactions.filter((t) => t.date.startsWith(monthPrefix) && t.date <= today);
  const spent = sumCents(monthTx.filter((t) => t.type === 'expense'));
  const income = sumCents(monthTx.filter((t) => t.type === 'income'));
  const uncategorizedCount = monthTx.filter(
    (t) => (t.type === 'expense' || t.type === 'income') && t.categoryId === null
  ).length;

  const grouped = groupByCategoryTree(categories, transactions);
  const byId = new Map(categories.map((c) => [c.id, c]));

  const alerts: CategoryMonthlyAlert[] = [];
  for (const [categoryId, budget] of budgets) {
    const category = byId.get(categoryId);
    if (!category) continue;
    alerts.push(
      computeMonthlyAlert(
        { categoryId, categoryName: category.name, budget, transactions: grouped.get(categoryId) ?? [] },
        referenceDate
      )
    );
  }

  const forecasts = categories
    .filter((c) => c.kind === 'expense' && c.parentId === null)
    .map((c) =>
      computeCategoryForecast(
        { categoryId: c.id, categoryName: c.name, transactions: grouped.get(c.id) ?? [] },
        referenceDate
      )
    )
    .filter((f) => f.yearSpentSoFar > 0)
    .sort((a, b) => b.projectedMonthTotal - a.projectedMonthTotal);

  return {
    spent,
    income,
    balance: income - spent,
    uncategorizedCount,
    alerts: sortBySeverityDesc(alerts),
    forecasts,
  };
}
