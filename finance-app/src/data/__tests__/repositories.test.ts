import { sql } from 'drizzle-orm';
import type { TableName } from '../changes';
import { ValidationError } from '../context';
import { DEFAULT_ACCOUNT_ID, prepareDatabase } from '../setup';
import { createTestContext } from '../../test-utils/testDb';

async function setup() {
  const ctx = createTestContext();
  const repos = await prepareDatabase(ctx);
  const changes: TableName[][] = [];
  repos.subscribe((tables) => changes.push([...tables]));
  return { ctx, repos, changes };
}

describe('transactions', () => {
  it('creates with sensible defaults and notifies subscribers', async () => {
    const { repos, changes } = await setup();
    const tx = await repos.transactions.create({
      accountId: DEFAULT_ACCOUNT_ID,
      type: 'expense',
      amount: 2350,
      date: '2026-03-09',
      categoryId: 'sys-alimentacao-padaria',
      description: '  Padaria  ',
      paymentMethod: 'pix',
    });
    expect(tx).toMatchObject({ description: 'Padaria', status: 'cleared', categorySource: 'manual', deletedAt: null });
    expect(await repos.transactions.get(tx.id)).toEqual(tx);
    expect(changes).toEqual([['transactions']]);
  });

  it('serializes concurrent writes instead of nesting transactions', async () => {
    const { ctx, repos } = await setup();
    const writes: Promise<unknown>[] = Array.from({ length: 25 }, (_, i) =>
      repos.transactions.create({ accountId: DEFAULT_ACCOUNT_ID, type: 'expense', amount: 100 + i, date: '2026-03-01' })
    );
    // A failing write in the middle must not break the ones queued after it.
    writes.splice(10, 0, ctx.write(async () => Promise.reject(new Error('falhou'))));
    writes.push(repos.budgets.set('sys-lazer', 1000));
    const results = await Promise.allSettled(writes);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
    expect(await repos.transactions.list()).toHaveLength(25);
  });

  it('rolls back a failed write', async () => {
    const { ctx, repos } = await setup();
    await expect(
      ctx.write(async (tx) => {
        await tx.run(sql`UPDATE accounts SET name = 'mudou'`);
        throw new Error('boom');
      })
    ).rejects.toThrow('boom');
    expect((await repos.accounts.get(DEFAULT_ACCOUNT_ID))?.name).toBe('Carteira');
  });

  it('rejects invalid amounts and dates', async () => {
    const { repos } = await setup();
    const base = { accountId: DEFAULT_ACCOUNT_ID, type: 'expense' as const, date: '2026-03-09' };
    await expect(repos.transactions.create({ ...base, amount: 0 })).rejects.toThrow(ValidationError);
    await expect(repos.transactions.create({ ...base, amount: 10.5 })).rejects.toThrow(ValidationError);
    await expect(repos.transactions.create({ ...base, amount: 100, date: '09/03/2026' })).rejects.toThrow(
      ValidationError
    );
  });

  it('records a category change as a manual correction', async () => {
    const { repos } = await setup();
    const tx = await repos.transactions.create({
      accountId: DEFAULT_ACCOUNT_ID,
      type: 'expense',
      amount: 5000,
      date: '2026-03-09',
      categoryId: 'sys-alimentacao-restaurantes',
      categorySource: 'ai',
      categoryConfidence: 0.6,
    });
    await repos.transactions.update(tx.id, { categoryId: 'sys-alimentacao-delivery' });
    expect(await repos.transactions.get(tx.id)).toMatchObject({
      categoryId: 'sys-alimentacao-delivery',
      categorySource: 'manual',
      categoryConfidence: null,
    });
  });

  it('filters by date range and hides deleted rows', async () => {
    const { repos } = await setup();
    const make = (date: string) =>
      repos.transactions.create({ accountId: DEFAULT_ACCOUNT_ID, type: 'expense', amount: 100, date });
    await make('2026-02-28');
    const march = await make('2026-03-01');
    const removed = await make('2026-03-05');
    await repos.transactions.remove(removed.id);

    const result = await repos.transactions.list({ from: '2026-03-01', to: '2026-03-31' });
    expect(result.map((t) => t.id)).toEqual([march.id]);
  });
});

describe('transfers and balances', () => {
  it('moves money between accounts without counting as spending, and deletes both legs together', async () => {
    const { repos } = await setup();
    const itau = await repos.accounts.create({ name: 'Itaú', type: 'checking', institution: 'itau', initialBalance: 100000 });
    const card = await repos.accounts.create({ name: 'Cartão Itaú', type: 'credit_card', closingDay: 3, dueDay: 10 });

    await repos.transactions.create({ accountId: card.id, type: 'expense', amount: 30000, date: '2026-03-02' });
    await repos.transactions.create({ accountId: itau.id, type: 'income', amount: 500000, date: '2026-03-05' });
    const transfer = await repos.transactions.createTransfer({
      fromAccountId: itau.id,
      toAccountId: card.id,
      amount: 30000,
      date: '2026-03-10',
      description: 'Pagamento fatura',
    });
    // Future-dated movements don't count yet.
    await repos.transactions.create({ accountId: itau.id, type: 'expense', amount: 999, date: '2026-04-01' });

    let balances = await repos.accounts.balances('2026-03-10');
    expect(balances.get(itau.id)).toBe(100000 + 500000 - 30000);
    expect(balances.get(card.id)).toBe(0);
    expect(balances.get(DEFAULT_ACCOUNT_ID)).toBe(0);

    await repos.transactions.update(transfer.out.id, { amount: 20000 });
    expect((await repos.transactions.get(transfer.in.id))?.amount).toBe(20000);

    await repos.transactions.remove(transfer.in.id);
    expect(await repos.transactions.get(transfer.out.id)).toBeUndefined();
    balances = await repos.accounts.balances('2026-03-10');
    expect(balances.get(card.id)).toBe(-30000);
  });

  it('refuses a transfer to the same account', async () => {
    const { repos } = await setup();
    await expect(
      repos.transactions.createTransfer({
        fromAccountId: DEFAULT_ACCOUNT_ID,
        toAccountId: DEFAULT_ACCOUNT_ID,
        amount: 100,
        date: '2026-03-10',
      })
    ).rejects.toThrow(ValidationError);
  });
});

describe('accounts', () => {
  it('only keeps credit-card fields on credit cards and validates days', async () => {
    const { repos } = await setup();
    const checking = await repos.accounts.create({ name: 'Santander', type: 'checking', closingDay: 5 });
    expect(checking.closingDay).toBeNull();
    await expect(repos.accounts.create({ name: 'Cartão', type: 'credit_card', dueDay: 32 })).rejects.toThrow(
      ValidationError
    );
  });

  it('cannot delete an account that has transactions, but can archive it', async () => {
    const { repos } = await setup();
    await repos.transactions.create({ accountId: DEFAULT_ACCOUNT_ID, type: 'expense', amount: 100, date: '2026-03-01' });
    await expect(repos.accounts.remove(DEFAULT_ACCOUNT_ID)).rejects.toThrow(ValidationError);

    await repos.accounts.update(DEFAULT_ACCOUNT_ID, { archived: true });
    expect(await repos.accounts.list()).toHaveLength(0);
    expect(await repos.accounts.list({ includeArchived: true })).toHaveLength(1);
  });
});

describe('categories', () => {
  it('subcategories inherit kind, color and icon from the parent', async () => {
    const { repos } = await setup();
    const sub = await repos.categories.create({ name: 'Feira', parentId: 'sys-alimentacao' });
    expect(sub).toMatchObject({ kind: 'expense', color: '#EA580C', icon: 'restaurant-outline', isSystem: false });
    await expect(repos.categories.create({ name: 'Neta', parentId: sub.id })).rejects.toThrow(ValidationError);
    await expect(repos.categories.create({ name: 'Sem tipo' })).rejects.toThrow(ValidationError);
  });

  it('removing a category removes its subcategories and budgets and uncategorizes its transactions', async () => {
    const { repos } = await setup();
    await repos.budgets.set('sys-alimentacao', 80000);
    const tx = await repos.transactions.create({
      accountId: DEFAULT_ACCOUNT_ID,
      type: 'expense',
      amount: 100,
      date: '2026-03-01',
      categoryId: 'sys-alimentacao-mercado',
    });

    await repos.categories.remove('sys-alimentacao');

    const ids = (await repos.categories.list()).map((c) => c.id);
    expect(ids).not.toContain('sys-alimentacao');
    expect(ids).not.toContain('sys-alimentacao-mercado');
    expect(await repos.budgets.list()).toEqual([]);
    expect(await repos.transactions.get(tx.id)).toMatchObject({ categoryId: null, categorySource: null });
  });
});

describe('budgets', () => {
  it('uses a month-specific budget over the default, and clears with null', async () => {
    const { repos } = await setup();
    await repos.budgets.set('sys-lazer', 50000);
    await repos.budgets.set('sys-lazer', 150000, '2026-07');
    expect((await repos.budgets.amountsForMonth('2026-06')).get('sys-lazer')).toBe(50000);
    expect((await repos.budgets.amountsForMonth('2026-07')).get('sys-lazer')).toBe(150000);

    await repos.budgets.set('sys-lazer', 60000);
    expect((await repos.budgets.amountsForMonth('2026-06')).get('sys-lazer')).toBe(60000);
    expect(await repos.budgets.list()).toHaveLength(2);

    await repos.budgets.set('sys-lazer', null);
    expect((await repos.budgets.amountsForMonth('2026-06')).has('sys-lazer')).toBe(false);
  });
});

describe('settings', () => {
  it('round-trips JSON values with a fallback', async () => {
    const { repos } = await setup();
    expect(await repos.settings.get('ai.provider', 'none')).toBe('none');
    await repos.settings.set('ai.provider', { id: 'claude' });
    await repos.settings.set('ai.provider', { id: 'openai' });
    expect(await repos.settings.get('ai.provider', null)).toEqual({ id: 'openai' });
  });
});
