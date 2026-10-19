import { summarizeBalances, summarizePeriod, expensesByCategory } from '../../domain/ledger';
import { ValidationError } from '../context';
import { countInconsistentNatures } from '../dataMigrations';
import { DEFAULT_ACCOUNT_ID, prepareDatabase } from '../setup';
import { createTestContext } from '../../test-utils/testDb';

// Briefing §16 cases that depend on the data layer: the repositories record
// each operation with the right nature, and the ledger totals come out right.

async function setup() {
  const ctx = createTestContext();
  const repos = await prepareDatabase(ctx);
  const checking = await repos.accounts.create({ id: 'itau', name: 'Itaú', type: 'checking', initialBalance: 500000 });
  const card = await repos.accounts.create({
    id: 'card',
    name: 'Cartão',
    type: 'credit_card',
    creditLimit: 1000000,
    closingDay: 10,
    dueDay: 17,
    paymentAccountId: 'itau',
  });
  const investments = await repos.accounts.create({ id: 'xp', name: 'XP', type: 'investment' });
  return { ctx, repos, checking, card, investments };
}

describe('financial rules end to end', () => {
  it('own transfer: no income or spending, balances move', async () => {
    const { repos } = await setup();
    const { out } = await repos.transactions.createTransfer({
      fromAccountId: 'itau',
      toAccountId: DEFAULT_ACCOUNT_ID,
      amount: 20000,
      date: '2026-03-05',
    });
    expect(out.nature).toBe('transfer');
    const totals = summarizePeriod(await repos.transactions.list());
    expect(totals).toMatchObject({ income: 0, expenses: 0 });
    const balances = await repos.accounts.balances('2026-03-31');
    expect(balances.get('itau')).toBe(480000);
    expect(balances.get(DEFAULT_ACCOUNT_ID)).toBe(20000);
  });

  it('card purchase then invoice payment: one expense, card back to zero, limit never counted', async () => {
    const { repos } = await setup();
    const purchase = await repos.transactions.create({
      accountId: 'card',
      type: 'expense',
      amount: 35000,
      date: '2026-03-12',
      categoryId: 'sys-alimentacao-mercado',
      paymentMethod: 'credit',
    });
    expect(purchase.invoiceMonth).toBe('2026-04'); // after the 10th closing -> invoice due April 17th
    const payment = await repos.transactions.createTransfer({ fromAccountId: 'itau', toAccountId: 'card', amount: 35000, date: '2026-04-17' });
    expect(payment.out.nature).toBe('card_payment');
    expect(payment.in.nature).toBe('card_payment');

    const all = await repos.transactions.list();
    expect(summarizePeriod(all)).toMatchObject({ expenses: 35000, neutral: { card_payment: 35000 } });

    const accounts = await repos.accounts.list();
    expect(summarizeBalances(accounts, await repos.accounts.balances('2026-03-31'))).toMatchObject({
      available: 500000,
      creditCards: -35000,
    });
    expect(summarizeBalances(accounts, await repos.accounts.balances('2026-04-30'))).toMatchObject({
      available: 465000,
      creditCards: 0,
    });
  });

  it('investment contribution and withdrawal are not consumption or income', async () => {
    const { repos } = await setup();
    const contribution = await repos.transactions.createTransfer({ fromAccountId: 'itau', toAccountId: 'xp', amount: 100000, date: '2026-03-06' });
    const withdrawal = await repos.transactions.createTransfer({ fromAccountId: 'xp', toAccountId: 'itau', amount: 30000, date: '2026-03-20' });
    expect(contribution.out.nature).toBe('investment_contribution');
    expect(withdrawal.out.nature).toBe('investment_withdrawal');
    expect(summarizePeriod(await repos.transactions.list())).toMatchObject({ income: 0, expenses: 0, result: 0 });
    const summary = summarizeBalances(await repos.accounts.list(), await repos.accounts.balances('2026-03-31'));
    expect(summary).toMatchObject({ available: 430000, investments: 70000 });
  });

  it('installments: total preserved, linked, one per invoice, each in its own month', async () => {
    const { repos } = await setup();
    const rows = await repos.transactions.createInstallments({
      id: 'group-1',
      accountId: 'card',
      total: 100000,
      count: 3,
      firstDate: '2026-01-31',
      categoryId: 'sys-casa',
      description: 'GELADEIRA',
    });
    expect(rows.map((r) => r.amount)).toEqual([33334, 33333, 33333]);
    expect(rows.map((r) => r.date)).toEqual(['2026-01-31', '2026-02-28', '2026-03-31']);
    expect(rows.map((r) => r.invoiceMonth)).toEqual(['2026-02', '2026-03', '2026-04']);
    expect(rows.map((r) => [r.installmentNumber, r.installmentTotal])).toEqual([[1, 3], [2, 3], [3, 3]]);
    expect(new Set(rows.map((r) => r.installmentGroupId))).toEqual(new Set(['group-1']));
    expect(rows.every((r) => r.paymentMethod === 'credit' && r.nature === 'expense')).toBe(true);

    const all = await repos.transactions.list();
    expect(summarizePeriod(all).expenses).toBe(100000);
    // Budget policy (D-008): each installment counts in its own month.
    const march = await repos.transactions.list({ from: '2026-03-01', to: '2026-03-31' });
    expect(summarizePeriod(march).expenses).toBe(33333);
    expect((await repos.transactions.listInstallments('group-1')).map((r) => r.installmentNumber)).toEqual([1, 2, 3]);
  });

  it('installments: saving the same purchase twice keeps one set', async () => {
    const { repos } = await setup();
    const input = { id: 'group-2', accountId: 'itau', total: 5000, count: 2, firstDate: '2026-03-01' };
    await repos.transactions.createInstallments(input);
    await repos.transactions.createInstallments(input);
    expect(await repos.transactions.list()).toHaveLength(2);
    await expect(repos.transactions.createInstallments({ ...input, id: 'x', count: 1 })).rejects.toThrow(ValidationError);
    await expect(repos.transactions.createInstallments({ ...input, id: 'y', total: 3, count: 5 })).rejects.toThrow(ValidationError);
  });

  it('refund: linked to the origin, same category, reduces spending once, never twice', async () => {
    const { repos } = await setup();
    const purchase = await repos.transactions.create({
      accountId: 'card',
      type: 'expense',
      amount: 20000,
      date: '2026-03-02',
      categoryId: 'sys-compras',
      description: 'LOJA X',
    });
    const refund = await repos.transactions.createRefund({ id: 'refund-1', refundOfId: purchase.id, amount: 20000, date: '2026-03-08' });
    expect(refund).toMatchObject({ type: 'income', nature: 'refund', refundOfId: purchase.id, categoryId: 'sys-compras', accountId: 'card' });

    // The same refund saved again (retry): no duplicate.
    await repos.transactions.createRefund({ id: 'refund-1', refundOfId: purchase.id, amount: 20000, date: '2026-03-08' });
    // A second, different refund of the same purchase: rejected, it was fully refunded.
    await expect(repos.transactions.createRefund({ refundOfId: purchase.id, amount: 1, date: '2026-03-09' })).rejects.toThrow(
      ValidationError
    );

    const all = await repos.transactions.list();
    expect(all).toHaveLength(2);
    expect(summarizePeriod(all)).toMatchObject({ income: 0, expenses: 0, refunds: 20000 });
    expect(expensesByCategory(all).get('sys-compras')).toBe(0);
    expect((await repos.accounts.balances('2026-03-31')).get('card')).toBe(0);
    expect(await repos.transactions.listRefunds(purchase.id)).toHaveLength(1);
  });

  it('refund: partial refunds add up to at most the original', async () => {
    const { repos } = await setup();
    const purchase = await repos.transactions.create({ accountId: 'itau', type: 'expense', amount: 10000, date: '2026-03-02' });
    await repos.transactions.createRefund({ refundOfId: purchase.id, amount: 6000, date: '2026-03-03' });
    await expect(repos.transactions.createRefund({ refundOfId: purchase.id, amount: 4001, date: '2026-03-04' })).rejects.toThrow(
      ValidationError
    );
    await repos.transactions.createRefund({ refundOfId: purchase.id, amount: 4000, date: '2026-03-04' });
    expect(summarizePeriod(await repos.transactions.list()).expenses).toBe(0);
  });

  it('refund: transfers and refunds themselves cannot be refunded; a refund cannot change direction', async () => {
    const { repos } = await setup();
    const { out } = await repos.transactions.createTransfer({ fromAccountId: 'itau', toAccountId: 'xp', amount: 100, date: '2026-03-01' });
    await expect(repos.transactions.createRefund({ refundOfId: out.id, amount: 100, date: '2026-03-02' })).rejects.toThrow(ValidationError);
    const purchase = await repos.transactions.create({ accountId: 'itau', type: 'expense', amount: 500, date: '2026-03-02' });
    const refund = await repos.transactions.createRefund({ refundOfId: purchase.id, amount: 500, date: '2026-03-03' });
    await expect(repos.transactions.createRefund({ refundOfId: refund.id, amount: 500, date: '2026-03-03' })).rejects.toThrow(ValidationError);
    await expect(repos.transactions.update(refund.id, { type: 'expense' })).rejects.toThrow(ValidationError);
  });

  it('changing the category moves the amount between categories', async () => {
    const { repos } = await setup();
    const t = await repos.transactions.create({ accountId: 'itau', type: 'expense', amount: 4200, date: '2026-03-02', categoryId: 'sys-lazer' });
    await repos.transactions.update(t.id, { categoryId: 'sys-transporte' });
    const byCategory = expensesByCategory(await repos.transactions.list());
    expect(byCategory.get('sys-lazer')).toBeUndefined();
    expect(byCategory.get('sys-transporte')).toBe(4200);
  });

  it('a failed or repeated save never duplicates a transaction', async () => {
    const { ctx, repos } = await setup();
    const input = { id: 'client-generated-id', accountId: 'itau', type: 'expense' as const, amount: 990, date: '2026-03-02' };
    const [a, b] = await Promise.all([repos.transactions.create(input), repos.transactions.create(input)]);
    expect(a.id).toBe(b.id);
    await repos.transactions.create(input);
    expect(await repos.transactions.list()).toHaveLength(1);

    // A save that fails (simulated with a trigger, like a full disk) leaves nothing behind;
    // retrying with the same id then saves exactly once.
    ctx.sqlite.exec(`CREATE TRIGGER fail_insert BEFORE INSERT ON transactions BEGIN SELECT RAISE(ABORT, 'disk full'); END`);
    const retry = { ...input, id: 'retried-id', amount: 1500 };
    await expect(repos.transactions.create(retry)).rejects.toThrow();
    await expect(repos.transactions.createInstallments({ id: 'g', accountId: 'itau', total: 900, count: 3, firstDate: '2026-03-01' })).rejects.toThrow();
    expect(await repos.transactions.list()).toHaveLength(1);
    ctx.sqlite.exec('DROP TRIGGER fail_insert');
    await repos.transactions.create(retry);
    await repos.transactions.create(retry);
    expect((await repos.transactions.list()).filter((t) => t.id === 'retried-id')).toHaveLength(1);

    const transfer = { id: 'pair-1', fromAccountId: 'itau', toAccountId: 'xp', amount: 100, date: '2026-03-02' };
    await repos.transactions.createTransfer(transfer);
    await repos.transactions.createTransfer(transfer);
    expect((await repos.transactions.list()).filter((t) => t.transferPairId === 'pair-1')).toHaveLength(2);
  });

  it('rejects natures that contradict the direction and unknown accounts', async () => {
    const { repos } = await setup();
    await expect(
      repos.transactions.create({ accountId: 'itau', type: 'expense', nature: 'income' as never, amount: 100, date: '2026-03-01' })
    ).rejects.toThrow(ValidationError);
    await expect(repos.transactions.create({ accountId: 'nope', type: 'expense', amount: 100, date: '2026-03-01' })).rejects.toThrow(
      ValidationError
    );
    const adjustment = await repos.transactions.create({ accountId: 'itau', type: 'income', nature: 'adjustment', amount: 777, date: '2026-03-01' });
    expect(adjustment.nature).toBe('adjustment');
    expect(summarizePeriod(await repos.transactions.list()).income).toBe(0);
  });

  it('flipping an expense to income resets its nature consistently', async () => {
    const { ctx, repos } = await setup();
    const t = await repos.transactions.create({ accountId: 'itau', type: 'expense', amount: 100, date: '2026-03-01' });
    await repos.transactions.update(t.id, { type: 'income' });
    expect((await repos.transactions.get(t.id))?.nature).toBe('income');
    expect(await countInconsistentNatures(ctx)).toBe(0);
  });
});
