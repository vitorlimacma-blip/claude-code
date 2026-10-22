import { makeTransaction } from '../../test-utils/fixtures';
import { applyExternalTransactions, connectionState, reconcile, type Connection, type ExternalTransaction, type LedgerPort } from '../openFinance';
import type { Transaction } from '../types';

// Prepared interfaces only: these tests use an in-memory ledger, never a bank.

const ext = (partial: Partial<ExternalTransaction> = {}): ExternalTransaction => ({
  externalId: 'x1',
  externalAccountId: 'bank-acc',
  date: '2026-10-10',
  amount: -5990,
  description: 'MERCADO BOM PRECO',
  pending: false,
  ...partial,
});

describe('reconcile', () => {
  it('the same external id is never imported twice', () => {
    const imported = makeTransaction({ type: 'expense', amount: 5990, date: '2026-10-10', externalId: 'x1' });
    expect(reconcile(ext(), 'acc', [imported])).toEqual({ kind: 'already_imported', transactionId: imported.id });
  });

  it('links one manual row with the same amount and direction within the window', () => {
    const manual = makeTransaction({ type: 'expense', amount: 5990, date: '2026-10-08', description: 'mercado' });
    expect(reconcile(ext(), 'acc', [manual])).toEqual({ kind: 'match', transactionId: manual.id });
  });

  it('does not match the opposite direction, another account, transfers or rows far away', () => {
    const rows = [
      makeTransaction({ type: 'income', amount: 5990, date: '2026-10-10' }),
      makeTransaction({ type: 'expense', amount: 5990, date: '2026-10-10', accountId: 'other' }),
      makeTransaction({ type: 'expense', amount: 5990, date: '2026-10-10', transferPairId: 'p' }),
      makeTransaction({ type: 'expense', amount: 5990, date: '2026-10-20' }),
    ];
    expect(reconcile(ext(), 'acc', rows)).toEqual({ kind: 'new' });
  });

  it('breaks ties by description, then sends real ambiguity to review', () => {
    const a = makeTransaction({ type: 'expense', amount: 5990, date: '2026-10-09', description: 'Mercado Bom Preço' });
    const b = makeTransaction({ type: 'expense', amount: 5990, date: '2026-10-11', description: 'Farmácia' });
    expect(reconcile(ext(), 'acc', [a, b])).toEqual({ kind: 'match', transactionId: a.id });
    const c = makeTransaction({ type: 'expense', amount: 5990, date: '2026-10-09', description: 'Padaria' });
    const d = makeTransaction({ type: 'expense', amount: 5990, date: '2026-10-11', description: 'Farmácia' });
    expect(reconcile(ext(), 'acc', [c, d])).toEqual({ kind: 'needs_review', candidateIds: [c.id, d.id] });
  });

  it('pending rows wait', () => {
    expect(reconcile(ext({ pending: true }), 'acc', [])).toEqual({ kind: 'skip_pending' });
  });
});

describe('applyExternalTransactions', () => {
  function memoryLedger(initial: Transaction[]) {
    const rows = [...initial];
    const review: string[] = [];
    const port: LedgerPort = {
      async rowsForAccount(accountId, from, to) {
        return rows.filter((t) => t.accountId === accountId && t.date >= from && t.date <= to);
      },
      async createImported(accountId, e) {
        rows.push(makeTransaction({ id: `import:test:${e.externalId}`, accountId, type: e.amount < 0 ? 'expense' : 'income', amount: Math.abs(e.amount), date: e.date, externalId: e.externalId }));
      },
      async linkExternal(id, externalId) {
        rows.find((t) => t.id === id)!.externalId = externalId;
      },
      async queueReview(e) {
        review.push(e.externalId);
      },
    };
    return { rows, review, port };
  }

  it('is idempotent: applying the same page again creates nothing', async () => {
    const manual = makeTransaction({ type: 'expense', amount: 5990, date: '2026-10-10' });
    const { rows, port } = memoryLedger([manual]);
    const page = [ext(), ext({ externalId: 'x2', amount: 250000, description: 'SALARIO' }), ext({ externalId: 'x3', pending: true })];
    const first = await applyExternalTransactions(page, { 'bank-acc': 'acc' }, port);
    expect(first).toEqual({ received: 3, created: 1, matched: 1, alreadyImported: 0, needsReview: 0, skippedPending: 1 });
    const again = await applyExternalTransactions(page, { 'bank-acc': 'acc' }, port);
    expect(again).toEqual({ received: 3, created: 0, matched: 0, alreadyImported: 2, needsReview: 0, skippedPending: 1 });
    expect(rows).toHaveLength(2);
  });

  it('ignores external accounts the person did not link', async () => {
    const { rows, port } = memoryLedger([]);
    await applyExternalTransactions([ext({ externalAccountId: 'not-linked' })], { 'bank-acc': 'acc' }, port);
    expect(rows).toHaveLength(0);
  });
});

describe('connectionState', () => {
  const now = new Date('2026-10-22T12:00:00Z');
  const base: Connection = {
    id: 'c',
    consent: { id: 'k', connectorId: 'x', institutionId: 'i', scopes: ['transactions'], grantedAt: '2026-01-01T00:00:00Z', expiresAt: '2027-01-01T00:00:00Z', revokedAt: null },
    lastAttemptAt: '2026-10-22T10:00:00Z',
    lastSuccessAt: '2026-10-22T10:00:00Z',
    lastError: null,
    syncing: false,
    accountLinks: {},
  };

  it('covers every state the screen must show', () => {
    expect(connectionState({ ...base, consent: null }, now)).toBe('awaiting_consent');
    expect(connectionState(base, now)).toBe('active');
    expect(connectionState({ ...base, syncing: true }, now)).toBe('syncing');
    expect(connectionState({ ...base, lastSuccessAt: '2026-10-20T10:00:00Z', lastAttemptAt: '2026-10-20T10:00:00Z' }, now)).toBe('stale');
    expect(connectionState({ ...base, lastAttemptAt: '2026-10-22T11:00:00Z', lastError: 'x' }, now)).toBe('error');
    expect(connectionState({ ...base, consent: { ...base.consent!, expiresAt: '2026-10-01T00:00:00Z' } }, now)).toBe('consent_expired');
    expect(connectionState({ ...base, consent: { ...base.consent!, revokedAt: '2026-10-21T00:00:00Z' } }, now)).toBe('revoked');
  });
});
