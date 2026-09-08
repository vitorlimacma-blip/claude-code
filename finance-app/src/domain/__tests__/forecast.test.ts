import { computeCategoryForecast, projectByRunRate, sumCents, transactionsInRange } from '../forecast';
import type { Transaction } from '../types';

function tx(partial: Partial<Transaction> & Pick<Transaction, 'date' | 'amount'>): Transaction {
  return {
    id: Math.random().toString(36),
    categoryId: 'cat-1',
    type: 'expense',
    note: '',
    createdAt: partial.date,
    ...partial,
  };
}

describe('projectByRunRate', () => {
  it('returns 0 when no days have elapsed', () => {
    expect(projectByRunRate(1000, 0, 30)).toBe(0);
  });

  it('projects linearly from the observed rate', () => {
    // Spent 300 in 3 days -> 100/day -> 30 days -> 3000
    expect(projectByRunRate(300, 3, 30)).toBe(3000);
  });

  it('rounds to the nearest cent', () => {
    // 100/3 = 33.33.../day * 10 days = 333.33 -> rounds to 333
    expect(projectByRunRate(100, 3, 10)).toBe(333);
  });
});

describe('sumCents / transactionsInRange', () => {
  it('sums amounts', () => {
    const txs = [tx({ date: '2026-03-01', amount: 100 }), tx({ date: '2026-03-02', amount: 250 })];
    expect(sumCents(txs)).toBe(350);
  });

  it('filters inclusively by date range', () => {
    const txs = [
      tx({ date: '2026-02-28', amount: 100 }),
      tx({ date: '2026-03-01', amount: 200 }),
      tx({ date: '2026-03-15', amount: 300 }),
      tx({ date: '2026-04-01', amount: 400 }),
    ];
    const inMarch = transactionsInRange(txs, '2026-03-01', '2026-03-31');
    expect(inMarch.map((t) => t.amount)).toEqual([200, 300]);
  });
});

describe('computeCategoryForecast', () => {
  // Reference date: March 10, 2026 (10 days elapsed in March; 69 days elapsed in the year).
  const referenceDate = new Date(2026, 2, 10);

  it('computes daily average and monthly projection from this month spend', () => {
    const transactions = [
      tx({ date: '2026-03-01', amount: 1000 }),
      tx({ date: '2026-03-05', amount: 1000 }),
      tx({ date: '2026-03-10', amount: 1000 }),
    ];

    const result = computeCategoryForecast(
      { categoryId: 'cat-1', categoryName: 'Mercado', transactions },
      referenceDate
    );

    expect(result.monthSpentSoFar).toBe(3000);
    // 3000 / 10 days elapsed = 300/day
    expect(result.dailyAverage).toBe(300);
    // March has 31 days -> 300 * 31 = 9300
    expect(result.projectedMonthTotal).toBe(9300);
  });

  it('excludes income and transactions outside the period', () => {
    const transactions = [
      tx({ date: '2026-03-05', amount: 1000, type: 'expense' }),
      tx({ date: '2026-03-05', amount: 5000, type: 'income' }),
      tx({ date: '2026-02-15', amount: 9999, type: 'expense' }), // last month, excluded from month total
    ];

    const result = computeCategoryForecast(
      { categoryId: 'cat-1', categoryName: 'Mercado', transactions },
      referenceDate
    );

    expect(result.monthSpentSoFar).toBe(1000);
  });

  it('projects the annual total from year-to-date spend', () => {
    const transactions = [
      tx({ date: '2026-01-01', amount: 6900 }), // 69 = day-of-year of March 10 2026 (not a leap year)
    ];

    const result = computeCategoryForecast(
      { categoryId: 'cat-1', categoryName: 'Mercado', transactions },
      referenceDate
    );

    expect(result.yearSpentSoFar).toBe(6900);
    // 6900 / 69 days = 100/day * 365 days (2026 is not a leap year) = 36500
    expect(result.projectedYearTotal).toBe(36500);
  });

  it('returns zeros for a category with no transactions', () => {
    const result = computeCategoryForecast(
      { categoryId: 'cat-1', categoryName: 'Mercado', transactions: [] },
      referenceDate
    );

    expect(result.dailyAverage).toBe(0);
    expect(result.projectedMonthTotal).toBe(0);
    expect(result.projectedYearTotal).toBe(0);
  });
});
