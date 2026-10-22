import { budgetStatuses } from '../../domain/budgets';
import { summarizePeriod } from '../../domain/ledger';
import { projectCash } from '../../domain/projection';
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

    // The dashboard sees the budgets, the expected bills and the month; the card owes this month's purchases.
    const today = '2026-10-19';
    const [categories, budgets, transactions, accounts, balances, recurrences] = await Promise.all([
      repos.categories.list(),
      repos.budgets.amountsForMonth('2026-10'),
      repos.transactions.list({ from: '2026-01-01', to: '2026-12-31' }),
      repos.accounts.list(),
      repos.accounts.balances(today),
      repos.recurrences.list(),
    ]);
    expect(summarizePeriod(transactions.filter((t) => t.date >= '2026-10-01')).income).toBeGreaterThanOrEqual(980000);
    expect(balances.get(DEMO_ACCOUNTS.itau)).toBeGreaterThan(0);
    expect(balances.get(DEMO_ACCOUNTS.santanderCard)).toBeLessThan(0);
    expect(recurrences.length).toBeGreaterThan(5);

    const statuses = budgetStatuses({ categories, budgets, transactions, recurrences, today });
    expect(statuses.map((b) => b.categoryName)).toContain('Delivery');
    expect(statuses.every((b) => b.method === 'typical')).toBe(true);

    const projection = projectCash({ today, accounts, balances, transactions, recurrences });
    expect(projection.status).toBe('ok');
    expect(projection.nextIncome).toMatchObject({ date: '2026-11-05', label: 'CREDITO SALARIO' });
    // Bills already paid this month (rent on the 5th, internet on the 15th) are not commitments again.
    expect(projection.outflows.map((e) => e.label)).not.toContain('PIX ENVIADO IMOBILIARIA LAR');
    expect(projection.outflows.map((e) => e.label)).not.toContain('CLARO NET VIRTUA');
    // Every past invoice was paid: none is reported as overdue.
    expect(projection.limitations.some((l) => l.includes('vencida'))).toBe(false);

    await repos.demo.clear();
    expect(await repos.demo.exists()).toBe(false);
    expect((await repos.transactions.list()).map((t) => t.id)).toEqual([mine.id]);
    expect(await repos.budgets.list()).toEqual([]);
    expect(await repos.recurrences.list()).toEqual([]);
  });
});
