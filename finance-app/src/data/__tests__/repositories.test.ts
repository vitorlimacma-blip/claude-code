import { summarizePeriod } from '../../domain/ledger';
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
    expect(tx).toMatchObject({
      description: 'Padaria',
      merchant: 'PADARIA',
      status: 'cleared',
      categorySource: 'manual',
      deletedAt: null,
    });
    await repos.transactions.update(tx.id, { description: 'IFD*IFOOD 12/03' });
    expect((await repos.transactions.get(tx.id))?.merchant).toBe('IFOOD');
    expect(changes).toEqual([['transactions'], ['transactions']]);
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

  it('deletes only unused categories (with subcategories and budgets); used ones must be archived or merged', async () => {
    const { repos } = await setup();
    await repos.budgets.set('sys-educacao', 80000);
    await repos.categories.remove('sys-educacao');
    const ids = (await repos.categories.list()).map((c) => c.id);
    expect(ids).not.toContain('sys-educacao');
    expect(ids).not.toContain('sys-educacao-cursos');
    expect(await repos.budgets.list()).toEqual([]);

    const tx = await repos.transactions.create({
      accountId: DEFAULT_ACCOUNT_ID,
      type: 'expense',
      amount: 100,
      date: '2026-03-01',
      categoryId: 'sys-alimentacao-mercado',
    });
    await expect(repos.categories.remove('sys-alimentacao')).rejects.toThrow(ValidationError);
    expect(await repos.transactions.get(tx.id)).toMatchObject({ categoryId: 'sys-alimentacao-mercado' });
    expect(await repos.categories.usage('sys-alimentacao')).toEqual({ transactions: 1, subcategories: 4, budgets: 0 });
  });

  it('archives a parent with its subcategories, keeps history, and brings a subcategory back with its parent', async () => {
    const { repos } = await setup();
    await repos.categories.setArchived('sys-lazer', true);
    const archived = (await repos.categories.list()).filter((c) => c.archived).map((c) => c.id);
    expect(archived.sort()).toEqual(['sys-lazer', 'sys-lazer-bares', 'sys-lazer-eventos', 'sys-lazer-hobbies', 'sys-lazer-viagens']);
    await repos.categories.setArchived('sys-lazer-viagens', false);
    const after = new Map((await repos.categories.list()).map((c) => [c.id, c.archived]));
    expect(after.get('sys-lazer-viagens')).toBe(false);
    expect(after.get('sys-lazer')).toBe(false);
    expect(after.get('sys-lazer-bares')).toBe(true);
  });

  it('reorders among siblings', async () => {
    const { repos } = await setup();
    const roots = async () =>
      (await repos.categories.list({ kind: 'expense' })).filter((c) => !c.parentId).map((c) => c.id);
    const before = await roots();
    await repos.categories.move(before[1], 'up');
    const after = await roots();
    expect(after.slice(0, 2)).toEqual([before[1], before[0]]);
    await repos.categories.move(after[0], 'up'); // already first: no change
    expect(await roots()).toEqual(after);
  });

  it('merges a category into another: transactions move, totals stay, its budget goes, it is deleted', async () => {
    const { repos } = await setup();
    await repos.budgets.set('sys-cuidados', 20000);
    const a = await repos.transactions.create({ accountId: DEFAULT_ACCOUNT_ID, type: 'expense', amount: 3000, date: '2026-03-01', categoryId: 'sys-cuidados' });
    const b = await repos.transactions.create({ accountId: DEFAULT_ACCOUNT_ID, type: 'expense', amount: 1000, date: '2026-03-02', categoryId: 'sys-compras-roupas' });
    const before = summarizePeriod(await repos.transactions.list()).expenses;

    const moved = await repos.categories.consolidate('sys-cuidados', 'sys-compras');
    expect(moved).toEqual({ transactions: 1, subcategories: 0, budgets: 1 });
    expect((await repos.transactions.get(a.id))?.categoryId).toBe('sys-compras');
    expect((await repos.transactions.get(b.id))?.categoryId).toBe('sys-compras-roupas');
    expect(summarizePeriod(await repos.transactions.list()).expenses).toBe(before);
    expect((await repos.categories.list()).some((c) => c.id === 'sys-cuidados')).toBe(false);
    expect((await repos.budgets.amountsForMonth('2026-03')).has('sys-cuidados')).toBe(false);

    await expect(repos.categories.consolidate('sys-lazer', 'sys-receita-salario')).rejects.toThrow(ValidationError);
    await expect(repos.categories.consolidate('sys-lazer', 'sys-lazer-viagens')).rejects.toThrow(ValidationError);
    await expect(repos.categories.consolidate('sys-lazer', 'sys-lazer')).rejects.toThrow(ValidationError);
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
