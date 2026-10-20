import { makeTransaction as tx } from '../../test-utils/fixtures';
import { budgetStatuses } from '../budgets';
import { compareEquivalentPeriods } from '../insights';
import { openInvoices } from '../ledger';
import { availableBalanceHistory, projectCash } from '../projection';
import { occurrencesBetween, reconcile, allOccurrences, suggestRecurrences } from '../recurrence';
import { splitOneOffs, typicalSpending } from '../spending';
import type { Account, Category, Recurrence } from '../types';

const sync = { createdAt: '', updatedAt: '', deletedAt: null };
const account = (id: string, type: Account['type'], extra: Partial<Account> = {}): Account => ({
  ...sync, id, name: id, type, institution: null, color: '#000', initialBalance: 0, creditLimit: null, closingDay: null, dueDay: null,
  paymentAccountId: null, currency: 'BRL', archived: false, sortOrder: 0, ...extra,
});
const rec = (partial: Partial<Recurrence> & Pick<Recurrence, 'id' | 'kind' | 'amount' | 'dayOfMonth'>): Recurrence => ({
  ...sync, description: partial.id, accountId: 'itau', categoryId: null, paymentMethod: 'pix', frequency: 'monthly', monthOfYear: null,
  startDate: '2026-01-01', endDate: null, ...partial,
});
const cat = (id: string, parentId: string | null = null): Category => ({
  ...sync, id, parentId, name: id, kind: 'expense', color: '#000', icon: 'x', isSystem: false, archived: false, sortOrder: 0,
});

describe('recurrence occurrences', () => {
  it('lists monthly and yearly due dates in a range, clamping short months', () => {
    const monthly = rec({ id: 'aluguel', kind: 'expense', amount: 1, dayOfMonth: 31 });
    expect(occurrencesBetween(monthly, '2026-01-15', '2026-04-10')).toEqual(['2026-01-31', '2026-02-28', '2026-03-31']);
    const yearly = rec({ id: 'ipva', kind: 'expense', amount: 1, dayOfMonth: 10, frequency: 'yearly', monthOfYear: 3 });
    expect(occurrencesBetween(yearly, '2026-01-01', '2027-12-31')).toEqual(['2026-03-10', '2027-03-10']);
    expect(occurrencesBetween({ ...monthly, startDate: '2026-03-01', endDate: '2026-03-31' }, '2026-01-01', '2026-12-31')).toEqual(['2026-03-31']);
  });

  it('reconciles occurrences with what was recorded: explicit link, or same category/merchant near the date and amount', () => {
    const energia = rec({ id: 'energia', kind: 'expense', amount: 20000, dayOfMonth: 10, categoryId: 'luz' });
    const occ = allOccurrences([energia], '2026-03-01', '2026-04-30');
    const march = tx({ id: 'm', type: 'expense', amount: 23500, date: '2026-03-12', categoryId: 'luz' });
    const unrelated = tx({ id: 'u', type: 'expense', amount: 20000, date: '2026-04-10', categoryId: 'mercado' });
    const matched = reconcile(occ, [march, unrelated]);
    expect(matched.get(occ[0])?.id).toBe('m');
    expect(matched.has(occ[1])).toBe(false);
    const linked = tx({ id: 'l', type: 'expense', amount: 99999, date: '2026-04-15', recurrenceId: 'energia' });
    expect(reconcile(occ, [march, linked]).get(occ[1])?.id).toBe('l');
  });

  it('suggests bills seen in at least 3 of the last 4 months, with stable amount and day', () => {
    const history = ['06', '07', '08', '09'].flatMap((m, i) => [
      tx({ type: 'expense', amount: 4990 + i, date: `2026-${m}-05`, description: 'NETFLIX.COM', merchant: 'NETFLIX', categoryId: 'streaming' }),
      tx({ type: 'expense', amount: 1000 * (i + 1) * 7, date: `2026-${m}-${10 + i * 5}`, description: 'MERCADO', merchant: 'MERCADO' }),
    ]);
    const suggestions = suggestRecurrences(history, [], '2026-10-19');
    expect(suggestions.map((s) => s.description)).toEqual(['NETFLIX.COM']);
    expect(suggestions[0]).toMatchObject({ kind: 'expense', dayOfMonth: 5, categoryId: 'streaming', months: 4 });
    expect(suggestRecurrences(history, [rec({ id: 'n', description: 'Netflix', kind: 'expense', amount: 1, dayOfMonth: 5 })], '2026-10-19')).toEqual([]);
  });
});

describe('typical variable spending', () => {
  it('leaves large one-off purchases out', () => {
    const rows = [100, 120, 90, 110, 95, 5000].map((amount, i) => ({ id: String(i), date: '2026-09-10', amount, categoryId: null }));
    const { regular, oneOffs } = splitOneOffs(rows);
    expect(oneOffs.map((o) => o.amount)).toEqual([5000]);
    expect(regular).toHaveLength(5);
  });

  it('uses the median of complete months covered by the data, without bills or installments', () => {
    const rows = [
      tx({ type: 'expense', amount: 100000, date: '2026-07-01' }),
      tx({ type: 'expense', amount: 60000, date: '2026-08-02' }),
      tx({ type: 'expense', amount: 80000, date: '2026-09-02' }),
      tx({ type: 'expense', amount: 999999, date: '2026-09-05', installmentGroupId: 'g' }),
      tx({ id: 'rent', type: 'expense', amount: 200000, date: '2026-09-05' }),
    ];
    const t = typicalSpending(rows, new Set(['rent']), '2026-10-19');
    expect(t.months).toEqual(['2026-07', '2026-08', '2026-09']);
    expect(t.monthly).toBe(80000);
    expect(t.daily).toBe(2667);
  });

  it('gives no estimate without a complete month (missing data is not zero)', () => {
    const t = typicalSpending([tx({ type: 'expense', amount: 5000, date: '2026-10-02' })], new Set(), '2026-10-19');
    expect(t).toMatchObject({ months: [], monthly: null, daily: null });
    // A history starting mid-month does not count that month.
    expect(typicalSpending([tx({ type: 'expense', amount: 5000, date: '2026-09-20' })], new Set(), '2026-10-19').months).toEqual([]);
  });
});

describe('open invoices', () => {
  const card = account('card', 'credit_card', { closingDay: 10, dueDay: 17 });
  it('owes purchases per invoice minus refunds and payments, oldest first', () => {
    const rows = [
      tx({ type: 'expense', amount: 30000, date: '2026-08-20', accountId: 'card', invoiceMonth: '2026-09' }),
      tx({ type: 'expense', amount: 50000, date: '2026-09-20', accountId: 'card', invoiceMonth: '2026-10' }),
      tx({ type: 'income', nature: 'refund', amount: 5000, date: '2026-09-25', accountId: 'card', invoiceMonth: '2026-10' }),
      tx({ type: 'transfer_in', nature: 'card_payment', amount: 30000, date: '2026-09-17', accountId: 'card' }),
      tx({ type: 'expense', amount: 7000, date: '2026-10-12', accountId: 'card' }),
    ];
    expect(openInvoices(card, rows)).toEqual([
      { accountId: 'card', month: '2026-10', closingDate: '2026-10-10', dueDate: '2026-10-17', amount: 45000 },
      { accountId: 'card', month: '2026-11', closingDate: '2026-11-10', dueDate: '2026-11-17', amount: 7000 },
    ]);
  });

  it('is unknown for a card without closing and due days', () => {
    expect(openInvoices(account('c2', 'credit_card'), [])).toBeNull();
  });
});

describe('cash projection (§10, §16)', () => {
  const today = '2026-10-19';
  const accounts = [
    account('itau', 'checking'),
    account('xp', 'investment'),
    account('card', 'credit_card', { closingDay: 10, dueDay: 25, creditLimit: 1_000_000 }),
  ];
  const balances = new Map([
    ['itau', 300000],
    ['xp', 5_000_000],
    ['card', -45000],
  ]);
  const history = ['07', '08', '09'].map((m) => tx({ type: 'expense', amount: 90000, date: `2026-${m}-02`, accountId: 'itau' }));
  const salary = rec({ id: 'salario', description: 'Salário', kind: 'income', amount: 800000, dayOfMonth: 5 });
  const rent = rec({ id: 'aluguel', description: 'Aluguel', kind: 'expense', amount: 150000, dayOfMonth: 28 });
  const internet = rec({ id: 'internet', description: 'Internet', kind: 'expense', amount: 10000, dayOfMonth: 15, categoryId: 'net' });
  const cardPurchase = tx({ type: 'expense', amount: 45000, date: '2026-10-11', accountId: 'card', invoiceMonth: '2026-10' });

  const run = (extra: Partial<Parameters<typeof projectCash>[0]> = {}) =>
    projectCash({ today, accounts, balances, transactions: [...history, cardPurchase], recurrences: [salary, rent, internet], ...extra });

  it('runs until the day before the next income, with every step shown', () => {
    const p = run();
    expect(p.status).toBe('ok');
    expect(p.nextIncome).toMatchObject({ date: '2026-11-05', label: 'Salário' });
    expect(p.to).toBe('2026-11-04');
    // Investments and card limits are not available money.
    expect(p.available).toBe(300000);
    // Unpaid internet (due on the 15th, no transaction): overdue, still counted, and said so.
    expect(p.outflows.map((e) => [e.label, e.amount, e.overdue ?? false])).toEqual([
      ['Internet', -10000, true],
      ['Fatura card', -45000, false],
      ['Aluguel', -150000, false],
    ]);
    expect(p.variable).toMatchObject({ daily: 3000, days: 16, amount: 48000 });
    expect(p.margin).toBe(300000 - 10000 - 45000 - 150000 - 48000);
    expect(p.steps.at(-1)).toMatchObject({ op: '=', cents: p.margin });
    expect(p.limitations.some((l) => l.includes('antes de hoje'))).toBe(true);
  });

  it('does not count again a bill already recorded, nor a card purchase plus its invoice', () => {
    const paidInternet = tx({ type: 'expense', amount: 10500, date: '2026-10-16', accountId: 'itau', categoryId: 'net' });
    const p = run({ transactions: [...history, cardPurchase, paidInternet], balances: new Map([...balances, ['itau', 289500]]) });
    expect(p.outflows.map((e) => e.label)).toEqual(['Fatura card', 'Aluguel']);
    // The purchase only enters through its invoice, once.
    expect(p.outflows.filter((e) => e.amount === -45000)).toHaveLength(1);
  });

  it('finds the lowest balance before the income arrives, even if the period ends positive', () => {
    const p = run({ recurrences: [salary, rent, internet, rec({ id: 'escola', description: 'Escola', kind: 'expense', amount: 120000, dayOfMonth: 26 })] });
    expect(p.lowest.date >= '2026-10-26').toBe(true);
    expect(p.lowest.amount).toBe(Math.min(...p.series.map((s) => s.balance)));
    expect(p.series[0]).toEqual({ date: today, balance: 300000 - 10000 });
  });

  it('with incomplete data, says what is missing instead of a falsely precise number', () => {
    const noHistory = run({ transactions: [cardPurchase] });
    expect(noHistory.status).toBe('limited');
    expect(noHistory.variable).toBeNull();
    expect(noHistory.reason).toMatch(/mês completo/);
    expect(noHistory.steps.some((s) => s.label.includes('variáveis'))).toBe(false);

    const noIncome = run({ recurrences: [rent] });
    expect(noIncome.status).toBe('limited');
    expect(noIncome.to).toBe('2026-10-31');
    expect(noIncome.reason).toMatch(/receita prevista/);

    expect(run({ accounts: [account('xp', 'investment')] }).status).toBe('unavailable');
  });

  it('flags a card without due day instead of ignoring its debt silently', () => {
    const p = run({ accounts: [account('itau', 'checking'), account('card', 'credit_card')] });
    expect(p.limitations.some((l) => l.includes('sem dias de fechamento'))).toBe(true);
  });
});

describe('budget status (neutral, no naive pace)', () => {
  const today = '2026-10-10';
  const categories = [cat('food'), cat('food-market', 'food'), cat('home')];
  const history = ['07', '08', '09'].flatMap((m) => [
    tx({ type: 'expense', amount: 60000, date: `2026-${m}-02`, categoryId: 'food-market' }),
    tx({ type: 'expense', amount: 150000, date: `2026-${m}-05`, categoryId: 'home', description: 'Aluguel' }),
  ]);
  const rent = rec({ id: 'aluguel', description: 'Aluguel', kind: 'expense', amount: 150000, dayOfMonth: 5, categoryId: 'home' });

  it('projects spent + commitments + the rest of a typical month', () => {
    const month = [tx({ type: 'expense', amount: 20000, date: '2026-10-03', categoryId: 'food-market' })];
    const [food] = budgetStatuses({ categories, budgets: new Map([['food', 70000]]), transactions: [...history, ...month], recurrences: [rent], today });
    expect(food).toMatchObject({ spent: 20000, committed: 0, typicalRemaining: 40000, projected: 60000, level: 'ok', method: 'typical' });
  });

  it('a big purchase early in the month does not get multiplied by the pace', () => {
    const month = [tx({ type: 'expense', amount: 55000, date: '2026-10-02', categoryId: 'food-market' })];
    const [food] = budgetStatuses({ categories, budgets: new Map([['food', 65000]]), transactions: [...history, ...month], recurrences: [rent], today });
    // A run-rate would project 55000 / 10 × 31 = 170500.
    expect(food.projected).toBe(60000);
    expect(food.level).toBe('warning');
  });

  it('counts an unpaid bill as committed, and not again once paid', () => {
    const budgets = new Map([['home', 200000]]);
    const unpaid = budgetStatuses({ categories, budgets, transactions: history, recurrences: [rent], today })[0];
    expect(unpaid).toMatchObject({ spent: 0, committed: 150000 });
    const paid = budgetStatuses({ categories, budgets, transactions: [...history, tx({ type: 'expense', amount: 150000, date: '2026-10-05', categoryId: 'home', description: 'Aluguel' })], recurrences: [rent], today })[0];
    expect(paid).toMatchObject({ spent: 150000, committed: 0, typicalRemaining: 0, projected: 150000 });
  });

  it('without history, projects only what is known', () => {
    const [food] = budgetStatuses({ categories, budgets: new Map([['food', 70000]]), transactions: [tx({ type: 'expense', amount: 20000, date: '2026-10-03', categoryId: 'food' })], recurrences: [], today });
    expect(food).toMatchObject({ method: 'none', projected: 20000, typicalRemaining: 0 });
  });
});

describe('equivalent periods', () => {
  it('compares the same days of the previous month, not the whole month', () => {
    const rows = [
      tx({ type: 'expense', amount: 1000, date: '2026-09-10', categoryId: 'food' }),
      tx({ type: 'expense', amount: 9000, date: '2026-09-25', categoryId: 'food' }),
      tx({ type: 'expense', amount: 3000, date: '2026-10-05', categoryId: 'food' }),
      tx({ type: 'expense', amount: 1, date: '2026-08-01' }),
    ];
    const c = compareEquivalentPeriods(rows, [cat('food')], '2026-10-19');
    expect(c.previous).toEqual({ from: '2026-09-01', to: '2026-09-19', spent: 1000 });
    expect(c.current.spent).toBe(3000);
    expect(c.comparable).toBe(true);
    expect(compareEquivalentPeriods(rows, [], '2026-03-31').previous.to).toBe('2026-02-28');
  });
});

describe('availableBalanceHistory', () => {
  it('rebuilds the daily available balance backwards from today, ignoring investments and cards', () => {
    const accounts = [account('itau', 'checking'), account('xp', 'investment'), account('card', 'credit_card')];
    const balances = new Map([['itau', 100000], ['xp', 999999], ['card', -5000]]);
    const rows = [
      tx({ type: 'income', amount: 50000, date: '2026-10-02', accountId: 'itau' }),
      tx({ type: 'expense', amount: 20000, date: '2026-10-03', accountId: 'itau' }),
      tx({ type: 'expense', amount: 7777, date: '2026-10-03', accountId: 'card' }),
      tx({ type: 'transfer_out', amount: 10000, date: '2026-10-04', accountId: 'itau', transferPairId: 'p' }),
    ];
    expect(availableBalanceHistory(accounts, balances, rows, '2026-10-01', '2026-10-04')).toEqual([
      { date: '2026-10-01', balance: 80000 },
      { date: '2026-10-02', balance: 130000 },
      { date: '2026-10-03', balance: 110000 },
      { date: '2026-10-04', balance: 100000 },
    ]);
  });
});
