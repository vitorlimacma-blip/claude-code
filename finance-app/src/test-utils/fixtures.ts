import { defaultNature } from '../domain/ledger';
import type { Transaction } from '../domain/types';

let seq = 0;

/** A complete in-memory transaction for pure domain tests; `nature` defaults from `type`. */
export function makeTransaction(partial: Partial<Transaction> & Pick<Transaction, 'type' | 'amount' | 'date'>): Transaction {
  return {
    id: `t${seq++}`,
    createdAt: '',
    updatedAt: '',
    deletedAt: null,
    accountId: 'acc',
    categoryId: null,
    nature: defaultNature(partial.type),
    currency: 'BRL',
    competenceMonth: null,
    dueDate: null,
    settledDate: null,
    refundOfId: null,
    description: '',
    merchant: null,
    notes: '',
    paymentMethod: 'other',
    status: 'cleared',
    installmentGroupId: null,
    installmentNumber: null,
    installmentTotal: null,
    transferPairId: null,
    invoiceMonth: null,
    importBatchId: null,
    externalId: null,
    fingerprint: null,
    categorySource: null,
    categoryConfidence: null,
    ...partial,
  };
}
