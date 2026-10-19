import { buildMonthOverview } from '../overview';
import { makeTransaction } from '../../test-utils/fixtures';
import type { Category } from '../types';

const sync = { createdAt: '', updatedAt: '', deletedAt: null };

function cat(id: string, parentId: string | null = null, kind: Category['kind'] = 'expense'): Category {
  return { ...sync, id, parentId, name: id, kind, color: '#000', icon: 'x', isSystem: true, archived: false, sortOrder: 0 };
}

const tx = makeTransaction;

describe('buildMonthOverview', () => {
  const categories = [cat('food'), cat('food-market', 'food'), cat('fun'), cat('salary', null, 'income')];
  const transactions = [
    tx({ type: 'expense', amount: 20000, date: '2026-03-02', categoryId: 'food-market' }),
    tx({ type: 'expense', amount: 5000, date: '2026-03-05', categoryId: 'food' }),
    tx({ type: 'expense', amount: 1000, date: '2026-03-06' }), // uncategorized
    tx({ type: 'expense', amount: 9000, date: '2026-02-10', categoryId: 'fun' }), // previous month
    tx({ type: 'income', amount: 500000, date: '2026-03-05', categoryId: 'salary' }),
    tx({ type: 'transfer_out', amount: 70000, date: '2026-03-07' }),
    tx({ type: 'transfer_in', amount: 70000, date: '2026-03-07' }),
  ];

  const overview = buildMonthOverview({
    categories,
    budgets: new Map([['food', 50000]]),
    transactions,
    today: '2026-03-10',
  });

  it('sums only this month, ignoring transfers', () => {
    expect(overview.spent).toBe(26000);
    expect(overview.income).toBe(500000);
    expect(overview.balance).toBe(474000);
    expect(overview.uncategorizedCount).toBe(1);
  });

  it('rolls subcategory spending into the parent budget', () => {
    expect(overview.alerts).toHaveLength(1);
    // 25000 in 10 days -> projected 77500 over 31 days > 50000 budget
    expect(overview.alerts[0]).toMatchObject({ categoryId: 'food', spentSoFar: 25000, level: 'projected_overrun' });
  });

  it('forecasts top-level expense categories with spending this year, biggest first', () => {
    expect(overview.forecasts.map((f) => f.categoryId)).toEqual(['food', 'fun']);
  });
});
