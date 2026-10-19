import { and, desc, eq, gte, isNull, lte, type SQL } from 'drizzle-orm';
import type {
  Cents,
  CategorySource,
  DateKey,
  PaymentMethod,
  Transaction,
  TransactionStatus,
  TransactionType,
} from '../../domain/types';
import { normalizeMerchant } from '../../domain/merchant';
import { type AppDatabase, type RepositoryContext, timestamp, ValidationError } from '../context';
import { transactions } from '../schema';

export interface NewTransactionInput {
  id?: string;
  accountId: string;
  categoryId?: string | null;
  type: Extract<TransactionType, 'expense' | 'income'>;
  amount: Cents;
  date: DateKey;
  description?: string;
  merchant?: string | null;
  notes?: string;
  paymentMethod?: PaymentMethod;
  status?: TransactionStatus;
  invoiceMonth?: string | null;
  importBatchId?: string | null;
  externalId?: string | null;
  fingerprint?: string | null;
  /** Defaults to 'manual' when a category is given. */
  categorySource?: CategorySource | null;
  categoryConfidence?: number | null;
}

export type TransactionPatch = Partial<
  Pick<
    NewTransactionInput,
    | 'accountId'
    | 'categoryId'
    | 'type'
    | 'amount'
    | 'date'
    | 'description'
    | 'merchant'
    | 'notes'
    | 'paymentMethod'
    | 'status'
    | 'invoiceMonth'
    | 'categorySource'
    | 'categoryConfidence'
  >
>;

export interface NewTransferInput {
  fromAccountId: string;
  toAccountId: string;
  amount: Cents;
  date: DateKey;
  description?: string;
  paymentMethod?: PaymentMethod;
}

export interface TransactionFilter {
  from?: DateKey;
  to?: DateKey;
  accountId?: string;
  categoryId?: string;
  type?: TransactionType;
  limit?: number;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function validateAmount(amount: Cents) {
  if (!Number.isInteger(amount) || amount <= 0) throw new ValidationError('Informe um valor maior que zero.');
}

function validateDate(date: DateKey) {
  if (!DATE_RE.test(date) || Number.isNaN(Date.parse(date))) {
    throw new ValidationError('Data inválida, use o formato AAAA-MM-DD.');
  }
}

function getLive(db: AppDatabase, id: string): Promise<Transaction | undefined> {
  return db
    .select()
    .from(transactions)
    .where(and(eq(transactions.id, id), isNull(transactions.deletedAt)))
    .get();
}

export function createTransactionsRepository(ctx: RepositoryContext) {
  const { db, bus } = ctx;

  function base(now: string): Omit<Transaction, 'id' | 'accountId' | 'type' | 'amount' | 'date'> {
    return {
      categoryId: null,
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
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };
  }

  return {
    /** Live transactions, newest first. */
    async list(filter: TransactionFilter = {}): Promise<Transaction[]> {
      const conditions: (SQL | undefined)[] = [
        isNull(transactions.deletedAt),
        filter.from ? gte(transactions.date, filter.from) : undefined,
        filter.to ? lte(transactions.date, filter.to) : undefined,
        filter.accountId ? eq(transactions.accountId, filter.accountId) : undefined,
        filter.categoryId ? eq(transactions.categoryId, filter.categoryId) : undefined,
        filter.type ? eq(transactions.type, filter.type) : undefined,
      ];
      const query = db
        .select()
        .from(transactions)
        .where(and(...conditions))
        .orderBy(desc(transactions.date), desc(transactions.createdAt));
      return filter.limit ? query.limit(filter.limit) : query;
    },

    async get(id: string): Promise<Transaction | undefined> {
      return getLive(db, id);
    },

    /** Both live legs of a transfer. */
    async getTransferPair(transferPairId: string): Promise<Transaction[]> {
      return db
        .select()
        .from(transactions)
        .where(and(eq(transactions.transferPairId, transferPairId), isNull(transactions.deletedAt)));
    },

    async create(input: NewTransactionInput): Promise<Transaction> {
      validateAmount(input.amount);
      validateDate(input.date);
      const now = timestamp(ctx);
      const categoryId = input.categoryId ?? null;
      const transaction: Transaction = {
        ...base(now),
        id: input.id ?? ctx.newId(),
        accountId: input.accountId,
        type: input.type,
        amount: input.amount,
        date: input.date,
        categoryId,
        description: input.description?.trim() ?? '',
        merchant: input.merchant ?? (normalizeMerchant(input.description ?? '') || null),
        notes: input.notes?.trim() ?? '',
        paymentMethod: input.paymentMethod ?? 'other',
        status: input.status ?? 'cleared',
        invoiceMonth: input.invoiceMonth ?? null,
        importBatchId: input.importBatchId ?? null,
        externalId: input.externalId ?? null,
        fingerprint: input.fingerprint ?? null,
        categorySource: input.categorySource ?? (categoryId ? 'manual' : null),
        categoryConfidence: input.categoryConfidence ?? null,
      };
      await ctx.write((tx) => tx.insert(transactions).values(transaction));
      bus.emit('transactions');
      return transaction;
    },

    /**
     * Updates a transaction. Changing the category without saying who changed
     * it records a manual correction, which is what the AI layer learns from.
     */
    async update(id: string, patch: TransactionPatch): Promise<void> {
      if (patch.amount !== undefined) validateAmount(patch.amount);
      if (patch.date !== undefined) validateDate(patch.date);
      await ctx.write(async (tx) => {
        const current = await getLive(tx, id);
        if (!current) throw new ValidationError('Lançamento não encontrado.');
        if (current.transferPairId && (patch.type || patch.accountId || patch.categoryId)) {
          throw new ValidationError('Para mudar uma transferência, exclua e crie novamente.');
        }

        const categoryChanged = patch.categoryId !== undefined && patch.categoryId !== current.categoryId;
        const values: Partial<Transaction> = {
          ...patch,
          ...(patch.description !== undefined && { description: patch.description.trim() }),
          ...(patch.description !== undefined &&
            patch.merchant === undefined && { merchant: normalizeMerchant(patch.description) || null }),
          ...(patch.notes !== undefined && { notes: patch.notes.trim() }),
          ...(categoryChanged &&
            patch.categorySource === undefined && {
              categorySource: patch.categoryId ? 'manual' : null,
              categoryConfidence: null,
            }),
          updatedAt: timestamp(ctx),
        };
        await tx.update(transactions).set(values).where(eq(transactions.id, id));

        // Keep both legs of a transfer in sync for the fields they share.
        if (current.transferPairId) {
          const shared: Partial<Transaction> = {};
          if (patch.amount !== undefined) shared.amount = patch.amount;
          if (patch.date !== undefined) shared.date = patch.date;
          if (patch.description !== undefined) shared.description = values.description;
          if (Object.keys(shared).length > 0) {
            await tx
              .update(transactions)
              .set({ ...shared, updatedAt: values.updatedAt })
              .where(eq(transactions.transferPairId, current.transferPairId));
          }
        }
      });
      bus.emit('transactions');
    },

    /** Soft-deletes a transaction (both legs, for a transfer). */
    async remove(id: string): Promise<void> {
      const now = timestamp(ctx);
      const removed = await ctx.write(async (tx) => {
        const current = await getLive(tx, id);
        if (!current) return false;
        await tx
          .update(transactions)
          .set({ deletedAt: now, updatedAt: now })
          .where(
            current.transferPairId ? eq(transactions.transferPairId, current.transferPairId) : eq(transactions.id, id)
          );
        return true;
      });
      if (removed) bus.emit('transactions');
    },

    /** Records a transfer between two of the user's accounts as a linked pair of rows. */
    async createTransfer(input: NewTransferInput): Promise<{ out: Transaction; in: Transaction }> {
      validateAmount(input.amount);
      validateDate(input.date);
      if (input.fromAccountId === input.toAccountId) {
        throw new ValidationError('Escolha contas diferentes para a transferência.');
      }
      const now = timestamp(ctx);
      const pairId = ctx.newId();
      const common = {
        ...base(now),
        amount: input.amount,
        date: input.date,
        description: input.description?.trim() ?? '',
        paymentMethod: input.paymentMethod ?? 'transfer',
        transferPairId: pairId,
      };
      const out: Transaction = { ...common, id: ctx.newId(), accountId: input.fromAccountId, type: 'transfer_out' };
      const inn: Transaction = { ...common, id: ctx.newId(), accountId: input.toAccountId, type: 'transfer_in' };
      await ctx.write((tx) => tx.insert(transactions).values([out, inn]));
      bus.emit('transactions');
      return { out, in: inn };
    },
  };
}

export type TransactionsRepository = ReturnType<typeof createTransactionsRepository>;
