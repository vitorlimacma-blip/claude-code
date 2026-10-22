import { makeTransaction as tx } from '../../test-utils/fixtures';
import { descriptionSuggestions, lastUsedAccountId } from '../autocomplete';
import { formatDayHeading } from '../dates';
import { collapseTransfers, groupByDay, transactionBadge } from '../transactionDisplay';
import { applyTransactionFilters, EMPTY_FILTERS } from '../transactionFilters';

const out = tx({ id: 'out', type: 'transfer_out', nature: 'card_payment', amount: 5000, date: '2026-10-10', accountId: 'itau', transferPairId: 'p1' });
const inn = tx({ id: 'in', type: 'transfer_in', nature: 'card_payment', amount: 5000, date: '2026-10-10', accountId: 'card', transferPairId: 'p1' });
const market = tx({ id: 'm', type: 'expense', amount: 8740, date: '2026-10-10', accountId: 'itau', description: 'Mercado Pão de Açúcar' });
const salary = tx({ id: 's', type: 'income', amount: 900000, date: '2026-10-05', accountId: 'itau', description: 'Salário' });

describe('collapseTransfers', () => {
  it('shows a transfer once, by its outgoing leg, with the other leg alongside', () => {
    const entries = collapseTransfers([out, inn, market]);
    expect(entries.map((e) => e.transaction.id)).toEqual(['out', 'm']);
    expect(entries[0].counterpart?.id).toBe('in');
  });

  it('shows the incoming leg when only the destination account is in focus', () => {
    expect(collapseTransfers([out, inn], ['card']).map((e) => e.transaction.id)).toEqual(['in']);
    expect(collapseTransfers([out, inn], ['itau', 'card']).map((e) => e.transaction.id)).toEqual(['out']);
  });

  it('keeps the leg that passed the filters, still finding its pair among all rows', () => {
    const entries = collapseTransfers([inn], [], [out, inn]);
    expect(entries.map((e) => e.transaction.id)).toEqual(['in']);
    expect(entries[0].counterpart?.id).toBe('out');
  });
});

describe('groupByDay', () => {
  it('groups by date with headings and the day result, transfers excluded', () => {
    const sections = groupByDay(collapseTransfers([out, inn, market, salary]), '2026-10-11');
    expect(sections.map((s) => [s.title, s.total, s.data.length])).toEqual([
      ['Ontem', -8740, 2],
      ['segunda-feira, 5 de outubro', 900000, 1],
    ]);
  });

  it('headings name today, yesterday and other years', () => {
    expect(formatDayHeading('2026-10-11', '2026-10-11')).toBe('Hoje');
    expect(formatDayHeading('2026-12-31', '2027-01-01')).toBe('Ontem');
    expect(formatDayHeading('2025-03-01', '2026-10-11')).toBe('sábado, 1 de março de 2025');
  });
});

describe('transactionBadge', () => {
  it('makes special rows recognizable', () => {
    expect(transactionBadge(out)).toBe('Pagamento de fatura');
    expect(transactionBadge(tx({ type: 'income', nature: 'refund', amount: 1, date: '2026-10-01' }))).toBe('Estorno');
    expect(transactionBadge(tx({ type: 'expense', amount: 1, date: '2026-10-01', installmentNumber: 2, installmentTotal: 3 }))).toBe('Parcela 2/3');
    expect(transactionBadge(market)).toBeUndefined();
  });
});

describe('search and nature filters', () => {
  const rows = [out, inn, market, salary];
  const run = (f: Partial<typeof EMPTY_FILTERS>) =>
    applyTransactionFilters(rows, { ...EMPTY_FILTERS, ...f }, [], [{ id: 'itau', name: 'Itaú conta corrente' }]).map((t) => t.id);

  it('searches ignoring case and accents, every word must match', () => {
    expect(run({ query: 'pao de acucar' })).toEqual(['m']);
    expect(run({ query: 'MERCADO açúcar' })).toEqual(['m']);
    expect(run({ query: 'salario itau' })).toEqual(['s']);
    expect(run({ query: 'padaria' })).toEqual([]);
  });

  it('filters by nature group', () => {
    expect(run({ natureGroups: ['card_payment'] })).toEqual(['out', 'in']);
    expect(run({ natureGroups: ['expense', 'income'] })).toEqual(['m', 's']);
  });
});

describe('autocomplete', () => {
  const history = [
    tx({ type: 'expense', amount: 2350, date: '2026-10-01', description: 'Padaria Pão Quente', categoryId: 'pad', accountId: 'itau', paymentMethod: 'pix' }),
    tx({ type: 'expense', amount: 1800, date: '2026-10-08', description: 'padaria pão quente', categoryId: 'pad', accountId: 'mp', paymentMethod: 'debit' }),
    tx({ type: 'expense', amount: 4000, date: '2026-09-01', description: 'Pão de Açúcar', categoryId: 'mercado', accountId: 'itau' }),
    tx({ type: 'expense', amount: 999, date: '2026-10-09', description: 'Farmácia', deletedAt: '2026-10-09T00:00:00Z' }),
    tx({ type: 'income', amount: 900000, date: '2026-10-05', description: 'Pagamento salário' }),
  ];

  it('suggests past descriptions with the latest account, method and category', () => {
    const [first, second] = descriptionSuggestions(history, 'pa', 'expense');
    expect(first).toMatchObject({ categoryId: 'pad', accountId: 'mp', paymentMethod: 'debit', count: 2, lastAmount: 1800 });
    expect(second.description).toBe('Pão de Açúcar');
  });

  it('matches the start of any word, ignores deleted rows and other types', () => {
    expect(descriptionSuggestions(history, 'quente', 'expense')).toHaveLength(1);
    expect(descriptionSuggestions(history, 'farm', 'expense')).toEqual([]);
    expect(descriptionSuggestions(history, 'sal', 'income')[0].description).toBe('Pagamento salário');
    expect(descriptionSuggestions(history, 'p', 'expense')).toEqual([]);
  });

  it('suggests the last account used, only if it still exists', () => {
    const rows = [
      tx({ type: 'expense', amount: 1, date: '2026-10-01', accountId: 'a', createdAt: '2026-10-01T10:00:00Z' }),
      tx({ type: 'expense', amount: 1, date: '2026-09-01', accountId: 'b', createdAt: '2026-10-02T10:00:00Z' }),
    ];
    expect(lastUsedAccountId(rows, new Set(['a', 'b']))).toBe('b');
    expect(lastUsedAccountId(rows, new Set(['a']))).toBe('a');
    expect(lastUsedAccountId(rows, new Set())).toBeNull();
  });
});
