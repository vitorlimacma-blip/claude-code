import { computeMonthlyAlert, sortBySeverityDesc } from '../alerts';
import type { Category, CategoryMonthlyAlert, Transaction } from '../types';

function category(partial: Partial<Category> = {}): Category {
  return {
    id: 'cat-1',
    name: 'Mercado',
    color: '#ff0000',
    monthlyBudget: 10000,
    createdAt: '2026-01-01',
    ...partial,
  };
}

function tx(date: string, amount: number): Transaction {
  return {
    id: Math.random().toString(36),
    categoryId: 'cat-1',
    type: 'expense',
    amount,
    date,
    note: '',
    createdAt: date,
  };
}

// Reference date: March 10, 2026 -> 10 days elapsed, 31 days in March.
const referenceDate = new Date(2026, 2, 10);

describe('computeMonthlyAlert', () => {
  it('returns null when the category has no budget', () => {
    const result = computeMonthlyAlert(category({ monthlyBudget: null }), [], referenceDate);
    expect(result).toBeNull();
  });

  it('is "ok" when spend is well under budget and pace is sustainable', () => {
    const transactions = [tx('2026-03-01', 1000), tx('2026-03-05', 1000)];
    const result = computeMonthlyAlert(category({ monthlyBudget: 10000 }), transactions, referenceDate);
    expect(result?.level).toBe('ok');
  });

  it('is "warning" when 80%+ of the budget is spent but the pace still projects under budget', () => {
    // Late in the month (day 29/31), so the run-rate projection barely extrapolates further.
    const lateReferenceDate = new Date(2026, 2, 29);
    const transactions = [tx('2026-03-01', 8000)];
    const result = computeMonthlyAlert(category({ monthlyBudget: 10000 }), transactions, lateReferenceDate);
    expect(result?.percentOfBudgetUsed).toBeCloseTo(0.8);
    expect(result?.projectedMonthTotal).toBeLessThan(10000);
    expect(result?.level).toBe('warning');
  });

  it('is "projected_overrun" when pace implies exceeding budget by month end, even under 80% spent', () => {
    // Spent 4000 in 10 days (400/day) -> projected 31 days * 400 = 12400 > 10000 budget,
    // while spentSoFar (4000) is only 40% of budget.
    const transactions = [tx('2026-03-01', 2000), tx('2026-03-10', 2000)];
    const result = computeMonthlyAlert(category({ monthlyBudget: 10000 }), transactions, referenceDate);
    expect(result?.level).toBe('projected_overrun');
    expect(result?.percentOfBudgetUsed).toBeLessThan(0.8);
    expect(result?.projectedMonthTotal).toBeGreaterThan(result!.budget);
  });

  it('is "exceeded" once spend so far reaches the budget', () => {
    const transactions = [tx('2026-03-01', 10500)];
    const result = computeMonthlyAlert(category({ monthlyBudget: 10000 }), transactions, referenceDate);
    expect(result?.level).toBe('exceeded');
  });

  it('treats a zero budget as exceeded by any spend', () => {
    const transactions = [tx('2026-03-01', 1)];
    const result = computeMonthlyAlert(category({ monthlyBudget: 0 }), transactions, referenceDate);
    expect(result?.level).toBe('exceeded');
  });
});

describe('sortBySeverityDesc', () => {
  it('orders exceeded > projected_overrun > warning > ok', () => {
    const base = {
      categoryId: 'x',
      categoryName: 'x',
      budget: 100,
      spentSoFar: 0,
      projectedMonthTotal: 0,
      percentOfBudgetUsed: 0,
      percentOfBudgetProjected: 0,
    };
    const alerts: CategoryMonthlyAlert[] = [
      { ...base, level: 'ok' },
      { ...base, level: 'exceeded' },
      { ...base, level: 'warning' },
      { ...base, level: 'projected_overrun' },
    ];

    expect(sortBySeverityDesc(alerts).map((a) => a.level)).toEqual([
      'exceeded',
      'projected_overrun',
      'warning',
      'ok',
    ]);
  });
});
