// Monetary amounts are stored as integer cents to avoid floating point drift.
export type Cents = number;

export interface Category {
  id: string;
  name: string;
  color: string;
  /** Monthly budget in cents. Null means no budget set (no alerts for this category). */
  monthlyBudget: Cents | null;
  createdAt: string; // ISO date
}

export type TransactionType = 'expense' | 'income';

export interface Transaction {
  id: string;
  categoryId: string;
  type: TransactionType;
  amount: Cents; // always stored positive; sign is derived from `type`
  /** Calendar date the expense/income happened, as YYYY-MM-DD (local, no time component). */
  date: string;
  note: string;
  createdAt: string; // ISO date
}

export type AlertLevel = 'ok' | 'warning' | 'projected_overrun' | 'exceeded';

export interface CategoryMonthlyAlert {
  categoryId: string;
  categoryName: string;
  level: AlertLevel;
  budget: Cents;
  spentSoFar: Cents;
  projectedMonthTotal: Cents;
  /** spentSoFar / budget, e.g. 0.8 for 80%. Can exceed 1. */
  percentOfBudgetUsed: number;
  /** projectedMonthTotal / budget. Can exceed 1. */
  percentOfBudgetProjected: number;
}

export interface ForecastPoint {
  categoryId: string;
  categoryName: string;
  dailyAverage: Cents;
  projectedMonthTotal: Cents;
  projectedYearTotal: Cents;
}
