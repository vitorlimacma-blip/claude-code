import {
  balanceDelta,
  expensesByCategory,
  inferTransferNature,
  installmentDates,
  installmentProgress,
  invoiceFor,
  isValidNatureForType,
  refundableAmount,
  resultDelta,
  splitInstallments,
  summarizeBalances,
  summarizePeriod,
} from '../ledger';
import { makeTransaction as tx } from '../../test-utils/fixtures';

const transferPair = (amount: number, nature: 'transfer' | 'card_payment' | 'investment_contribution' | 'investment_withdrawal') => [
  tx({ type: 'transfer_out', nature, amount, date: '2026-03-10', accountId: 'from', transferPairId: 'p' }),
  tx({ type: 'transfer_in', nature, amount, date: '2026-03-10', accountId: 'to', transferPairId: 'p' }),
];

describe('summarizePeriod (briefing §9 and §16)', () => {
  it('a transfer between own accounts changes neither income nor spending', () => {
    const totals = summarizePeriod([
      tx({ type: 'income', amount: 500000, date: '2026-03-05' }),
      tx({ type: 'expense', amount: 12000, date: '2026-03-06' }),
      ...transferPair(100000, 'transfer'),
    ]);
    expect(totals).toMatchObject({ income: 500000, expenses: 12000, result: 488000 });
    // Counted once (outgoing leg), reported apart.
    expect(totals.neutral).toEqual({ transfer: 100000 });
  });

  it('a card purchase followed by the invoice payment counts as one expense', () => {
    const purchase = tx({ type: 'expense', amount: 30000, date: '2026-03-02', accountId: 'card', categoryId: 'food' });
    const totals = summarizePeriod([purchase, ...transferPair(30000, 'card_payment')]);
    expect(totals.expenses).toBe(30000);
    expect(totals.neutral.card_payment).toBe(30000);
  });

  it('an investment contribution is not consumption, a withdrawal is not income', () => {
    const totals = summarizePeriod([...transferPair(100000, 'investment_contribution'), ...transferPair(20000, 'investment_withdrawal')]);
    expect(totals).toMatchObject({ income: 0, expenses: 0, result: 0 });
    expect(totals.neutral).toEqual({ investment_contribution: 100000, investment_withdrawal: 20000 });
  });

  it('investment yields and balance adjustments never become available income', () => {
    const totals = summarizePeriod([
      tx({ type: 'income', nature: 'investment_return', amount: 4500, date: '2026-03-31' }),
      tx({ type: 'income', nature: 'adjustment', amount: 99999, date: '2026-03-01' }),
      tx({ type: 'expense', nature: 'adjustment', amount: 100, date: '2026-03-01' }),
    ]);
    expect(totals).toMatchObject({ income: 0, expenses: 0, result: 0 });
    expect(totals.neutral).toEqual({ investment_return: 4500, adjustment: 99899 });
  });

  it('a refund reduces spending once and never counts as income', () => {
    const purchase = tx({ type: 'expense', amount: 25000, date: '2026-03-02', categoryId: 'shoes' });
    const refund = tx({ type: 'income', nature: 'refund', amount: 25000, date: '2026-03-04', categoryId: 'shoes', refundOfId: purchase.id });
    const totals = summarizePeriod([purchase, refund]);
    expect(totals).toMatchObject({ income: 0, expenses: 0, refunds: 25000, result: 0 });
    expect(expensesByCategory([purchase, refund]).get('shoes')).toBe(0);
  });

  it('a partial refund leaves the rest as spending', () => {
    const purchase = tx({ type: 'expense', amount: 10000, date: '2026-03-02' });
    const refund = tx({ type: 'income', nature: 'refund', amount: 2550, date: '2026-03-03', refundOfId: purchase.id });
    expect(summarizePeriod([purchase, refund]).expenses).toBe(7450);
  });

  it('never sums different currencies', () => {
    const totals = summarizePeriod([
      tx({ type: 'expense', amount: 1000, date: '2026-03-02' }),
      tx({ type: 'expense', amount: 5000, date: '2026-03-02', currency: 'USD' }),
    ]);
    expect(totals.expenses).toBe(1000);
    expect(totals.otherCurrencyCount).toBe(1);
    expect(summarizePeriod([tx({ type: 'expense', amount: 5000, date: '2026-03-02', currency: 'USD' })], 'USD').expenses).toBe(5000);
  });

  it('changing a category moves the amount between category totals, the overall total stays', () => {
    const t = tx({ type: 'expense', amount: 4200, date: '2026-03-02', categoryId: 'food' });
    const before = expensesByCategory([t]);
    const after = expensesByCategory([{ ...t, categoryId: 'transport' }]);
    expect(before.get('food')).toBe(4200);
    expect(after.get('food')).toBeUndefined();
    expect(after.get('transport')).toBe(4200);
    expect(summarizePeriod([t]).expenses).toBe(summarizePeriod([{ ...t, categoryId: 'transport' }]).expenses);
  });

  it('resultDelta and balanceDelta agree with the totals', () => {
    const rows = [
      tx({ type: 'income', amount: 1000, date: '2026-03-01' }),
      tx({ type: 'expense', amount: 300, date: '2026-03-01' }),
      tx({ type: 'income', nature: 'refund', amount: 100, date: '2026-03-01' }),
      ...transferPair(500, 'transfer'),
    ];
    expect(rows.reduce((s, t) => s + resultDelta(t), 0)).toBe(summarizePeriod(rows).result);
    // Transfer legs cancel out across accounts.
    expect(rows.reduce((s, t) => s + balanceDelta(t), 0)).toBe(1000 - 300 + 100);
  });
});

describe('natures', () => {
  it('only allows natures that match the direction', () => {
    expect(isValidNatureForType('expense', 'expense')).toBe(true);
    expect(isValidNatureForType('expense', 'income')).toBe(false);
    expect(isValidNatureForType('card_payment', 'transfer_out')).toBe(true);
    expect(isValidNatureForType('card_payment', 'expense')).toBe(false);
    expect(isValidNatureForType('refund', 'income')).toBe(true);
  });

  it('infers transfer natures conservatively from the account types', () => {
    expect(inferTransferNature('checking', 'credit_card')).toBe('card_payment');
    expect(inferTransferNature('checking', 'investment')).toBe('investment_contribution');
    expect(inferTransferNature('investment', 'checking')).toBe('investment_withdrawal');
    expect(inferTransferNature('checking', 'savings')).toBe('transfer');
    expect(inferTransferNature('investment', 'investment')).toBe('transfer');
    expect(inferTransferNature('credit_card', 'credit_card')).toBe('transfer');
    expect(inferTransferNature(undefined, 'credit_card')).toBe('card_payment');
  });
});

describe('summarizeBalances', () => {
  const accounts = [
    { id: 'itau', type: 'checking' as const, currency: 'BRL' },
    { id: 'wallet', type: 'wallet' as const, currency: 'BRL' },
    { id: 'card', type: 'credit_card' as const, currency: 'BRL' },
    { id: 'xp', type: 'investment' as const, currency: 'BRL' },
    { id: 'usd', type: 'checking' as const, currency: 'USD' },
  ];
  const balances = new Map([
    ['itau', 250000],
    ['wallet', 5000],
    ['card', -80000],
    ['xp', 1000000],
    ['usd', 99999],
  ]);

  it('separates available money, investments and card debt; a card limit is never a balance', () => {
    expect(summarizeBalances(accounts, balances)).toEqual({
      currency: 'BRL',
      available: 255000,
      investments: 1000000,
      creditCards: -80000,
      netWorth: 1175000,
      otherCurrencyCount: 1,
    });
  });
});

describe('invoiceFor', () => {
  it('a purchase before the closing day falls in the invoice closing that month', () => {
    expect(invoiceFor('2026-03-05', 10, 17)).toEqual({ month: '2026-03', closingDate: '2026-03-10', dueDate: '2026-03-17' });
  });

  it('a purchase on or after the closing day goes to the next invoice', () => {
    expect(invoiceFor('2026-03-10', 10, 17).month).toBe('2026-04');
    expect(invoiceFor('2026-03-25', 10, 17)).toEqual({ month: '2026-04', closingDate: '2026-04-10', dueDate: '2026-04-17' });
  });

  it('is due the month after closing when the due day comes before the closing day', () => {
    expect(invoiceFor('2026-03-05', 25, 5)).toEqual({ month: '2026-04', closingDate: '2026-03-25', dueDate: '2026-04-05' });
  });

  it('crosses the year boundary', () => {
    expect(invoiceFor('2026-12-28', 20, 2)).toEqual({ month: '2027-02', closingDate: '2027-01-20', dueDate: '2027-02-02' });
  });

  it('clamps days past the end of the month', () => {
    expect(invoiceFor('2026-02-27', 31, 10)).toEqual({ month: '2026-03', closingDate: '2026-02-28', dueDate: '2026-03-10' });
    expect(invoiceFor('2026-02-28', 31, 10).closingDate).toBe('2026-03-31');
  });
});

describe('installments', () => {
  it('preserves the total, with the leftover cents on the first installment', () => {
    expect(splitInstallments(10000, 3)).toEqual([3334, 3333, 3333]);
    expect(splitInstallments(10002, 3)).toEqual([3334, 3334, 3334]);
    expect(splitInstallments(199, 2)).toEqual([100, 99]);
    for (const [total, count] of [[12345, 7], [1, 1], [99999999, 12], [1000, 10]]) {
      const parts = splitInstallments(total, count);
      expect(parts).toHaveLength(count);
      expect(parts.reduce((a, b) => a + b, 0)).toBe(total);
      expect(Math.max(...parts) - Math.min(...parts)).toBeLessThan(count);
    }
  });

  it('rejects impossible splits instead of producing zero or fractional installments', () => {
    expect(() => splitInstallments(2, 3)).toThrow();
    expect(() => splitInstallments(100.5, 2)).toThrow();
    expect(() => splitInstallments(100, 0)).toThrow();
  });

  it('dates each installment in the following months, clamping short months', () => {
    expect(installmentDates('2026-01-31', 4)).toEqual(['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30']);
    expect(installmentDates('2027-11-15', 3)).toEqual(['2027-11-15', '2027-12-15', '2028-01-15']);
  });

  it('keeps the contracted total and future commitments visible', () => {
    const rows = splitInstallments(10000, 3).map((amount, i) => ({ amount, date: installmentDates('2026-03-05', 3)[i] }));
    expect(installmentProgress(rows, '2026-04-10')).toEqual({ total: 10000, count: 3, dueSoFar: 2, remaining: 3333 });
  });
});

describe('refundableAmount', () => {
  it('never lets refunds exceed the original amount', () => {
    expect(refundableAmount({ amount: 10000 }, [])).toBe(10000);
    expect(refundableAmount({ amount: 10000 }, [{ amount: 4000 }])).toBe(6000);
    expect(refundableAmount({ amount: 10000 }, [{ amount: 4000 }, { amount: 6000 }])).toBe(0);
  });
});
