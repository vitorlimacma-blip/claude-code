import {
  activeFilterCount,
  applyTransactionFilters,
  EMPTY_FILTERS,
  summarizeTransactions,
  toggleValue,
  UNCATEGORIZED,
  type TransactionFilters,
} from '../transactionFilters';
import type { Category, Transaction } from '../types';

const sync = { createdAt: '', updatedAt: '', deletedAt: null };
const cat = (id: string, parentId: string | null = null): Category => ({
  ...sync, id, parentId, name: id, kind: 'expense', color: '#000', icon: 'x', isSystem: true, sortOrder: 0,
});
const categories = [cat('food'), cat('food-market', 'food'), cat('food-delivery', 'food'), cat('transport')];

type Row = Pick<Transaction, 'id' | 'type' | 'categoryId' | 'paymentMethod' | 'accountId' | 'amount'>;
const rows: Row[] = [
  { id: 'market-credit', type: 'expense', categoryId: 'food-market', paymentMethod: 'credit', accountId: 'card', amount: 100 },
  { id: 'market-debit', type: 'expense', categoryId: 'food-market', paymentMethod: 'debit', accountId: 'itau', amount: 200 },
  { id: 'delivery-credit', type: 'expense', categoryId: 'food-delivery', paymentMethod: 'credit', accountId: 'card', amount: 300 },
  { id: 'uber-pix', type: 'expense', categoryId: 'transport', paymentMethod: 'pix', accountId: 'mp', amount: 400 },
  { id: 'none-pix', type: 'expense', categoryId: null, paymentMethod: 'pix', accountId: 'itau', amount: 500 },
  { id: 'deleted-cat', type: 'expense', categoryId: 'gone', paymentMethod: 'debit', accountId: 'itau', amount: 600 },
  { id: 'salary', type: 'income', categoryId: null, paymentMethod: 'transfer', accountId: 'itau', amount: 10000 },
  { id: 'transfer-out', type: 'transfer_out', categoryId: null, paymentMethod: 'transfer', accountId: 'itau', amount: 700 },
];

const filter = (f: Partial<TransactionFilters>) =>
  applyTransactionFilters(rows, { ...EMPTY_FILTERS, ...f }, categories).map((r) => r.id);

describe('applyTransactionFilters', () => {
  it('returns everything when no filter is active', () => {
    expect(filter({})).toHaveLength(rows.length);
  });

  it('matches a parent category through its subcategories', () => {
    expect(filter({ categoryIds: ['food'] })).toEqual(['market-credit', 'market-debit', 'delivery-credit']);
  });

  it('ORs values inside one dimension and ANDs across dimensions', () => {
    expect(filter({ categoryIds: ['food', 'transport'] })).toHaveLength(4);
    expect(filter({ categoryIds: ['food'], paymentMethods: ['credit'] })).toEqual(['market-credit', 'delivery-credit']);
    expect(filter({ categoryIds: ['food'], paymentMethods: ['credit'], accountIds: ['itau'] })).toEqual([]);
    expect(filter({ paymentMethods: ['pix', 'debit'], accountIds: ['itau'] })).toEqual(['market-debit', 'none-pix', 'deleted-cat']);
  });

  it('"Sem categoria" matches uncategorized and deleted categories, never transfers', () => {
    expect(filter({ categoryIds: [UNCATEGORIZED] })).toEqual(['none-pix', 'deleted-cat', 'salary']);
    expect(filter({ categoryIds: [UNCATEGORIZED, 'transport'] })).toContain('uber-pix');
  });

  it('keeps transfers when filtering only by account or payment method', () => {
    expect(filter({ accountIds: ['itau'] })).toContain('transfer-out');
  });
});

describe('helpers', () => {
  it('summarizes count and net total without counting transfers in the total', () => {
    expect(summarizeTransactions(rows)).toEqual({ count: 8, total: 10000 - 2100, transferCount: 1 });
  });

  it('toggles values and counts active filters', () => {
    expect(toggleValue(['a'], 'b')).toEqual(['a', 'b']);
    expect(toggleValue(['a', 'b'], 'a')).toEqual(['b']);
    expect(activeFilterCount({ categoryIds: ['a'], paymentMethods: ['pix', 'debit'], accountIds: [] })).toBe(3);
  });
});
