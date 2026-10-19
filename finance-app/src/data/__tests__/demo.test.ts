import { buildMonthOverview } from '../../domain/overview';
import { DEMO_ACCOUNTS } from '../../domain/demoData';
import { createTestContext } from '../../test-utils/testDb';
import { DEFAULT_ACCOUNT_ID, prepareDatabase } from '../setup';

describe('demo data', () => {
  it('generates, regenerates without duplicating, and clears only demo rows', async () => {
    const repos = await prepareDatabase(createTestContext());
    const mine = await repos.transactions.create({ accountId: DEFAULT_ACCOUNT_ID, type: 'expense', amount: 1000, date: '2026-10-01' });

    expect(await repos.demo.exists()).toBe(false);
    const first = await repos.demo.generate('2026-10-19');
    await repos.demo.generate('2026-10-19');
    expect(await repos.demo.exists()).toBe(true);
    expect(await repos.transactions.list()).toHaveLength(first.transactions + 1);
    expect(await repos.accounts.list()).toHaveLength(5);

    const ifood = (await repos.transactions.list()).find((t) => t.description === 'IFD*IFOOD');
    expect(ifood).toMatchObject({ merchant: 'IFOOD', categorySource: 'manual' });

    // The dashboard sees the budgets and the month, and the card owes this month's purchases.
    const [categories, budgets, transactions, balances] = await Promise.all([
      repos.categories.list(),
      repos.budgets.amountsForMonth('2026-10'),
      repos.transactions.list({ from: '2026-01-01', to: '2026-10-19' }),
      repos.accounts.balances('2026-10-19'),
    ]);
    const overview = buildMonthOverview({ categories, budgets, transactions, today: '2026-10-19' });
    expect(overview.income).toBeGreaterThanOrEqual(980000);
    expect(balances.get(DEMO_ACCOUNTS.itau)).toBeGreaterThan(0);
    expect(overview.alerts.map((a) => a.categoryName)).toContain('Delivery');
    expect(overview.uncategorizedCount).toBeGreaterThan(0);
    expect(balances.get(DEMO_ACCOUNTS.santanderCard)).toBeLessThan(0);

    await repos.demo.clear();
    expect(await repos.demo.exists()).toBe(false);
    expect((await repos.transactions.list()).map((t) => t.id)).toEqual([mine.id]);
    expect(await repos.budgets.list()).toEqual([]);
  });
});
