import { DEFAULT_EXPENSE_CATEGORIES, DEFAULT_INCOME_CATEGORIES } from '../defaultCategories';
import { DEMO_ACCOUNTS, DEMO_PREFIX, generateDemoData } from '../demoData';

const today = '2026-10-19';
const data = generateDemoData(today);
const systemIds = new Set(
  [...DEFAULT_EXPENSE_CATEGORIES, ...DEFAULT_INCOME_CATEGORIES].flatMap((c) => [c.id, ...(c.children ?? []).map((ch) => ch.id)])
);

describe('generateDemoData', () => {
  it('is deterministic and never dated in the future', () => {
    expect(generateDemoData(today)).toEqual(data);
    expect(data.transactions.every((t) => t.date <= today)).toBe(true);
    expect(data.transactions[0].date >= '2026-05-01').toBe(true);
  });

  it('marks every row with the demo prefix and only uses existing default categories', () => {
    const ids = [...data.accounts, ...data.transactions, ...data.budgets].map((r) => r.id);
    expect(ids.every((id) => id.startsWith(DEMO_PREFIX))).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
    for (const t of data.transactions) if (t.categoryId) expect(systemIds.has(t.categoryId)).toBe(true);
    for (const b of data.budgets) expect(systemIds.has(b.categoryId)).toBe(true);
  });

  it('has income every month, fixed bills, card spending and uncategorized entries', () => {
    const salaries = data.transactions.filter((t) => t.description === 'CREDITO SALARIO');
    expect(salaries).toHaveLength(6);
    expect(data.transactions.filter((t) => t.description === 'NETFLIX.COM').length).toBeGreaterThanOrEqual(5);
    expect(data.transactions.some((t) => t.accountId === DEMO_ACCOUNTS.santanderCard && t.type === 'expense')).toBe(true);
    expect(data.transactions.filter((t) => t.categoryId === null && t.type === 'expense')).toHaveLength(8);
    expect(data.transactions.length).toBeGreaterThan(300);
  });

  it('pays each card invoice with a linked transfer equal to the previous month purchases', () => {
    const payments = data.transactions.filter((t) => t.description.startsWith('PAGAMENTO FATURA') && t.type === 'transfer_in');
    expect(payments.length).toBe(5);
    const september = data.transactions
      .filter((t) => t.accountId === DEMO_ACCOUNTS.santanderCard && t.type === 'expense' && t.date.startsWith('2026-09'))
      .reduce((s, t) => s + t.amount, 0);
    expect(payments.find((p) => p.date === '2026-10-10')?.amount).toBe(september);
    for (const p of payments) {
      const legs = data.transactions.filter((t) => t.transferPairId === p.transferPairId);
      expect(legs.map((l) => l.type).sort()).toEqual(['transfer_in', 'transfer_out']);
    }
  });
});
