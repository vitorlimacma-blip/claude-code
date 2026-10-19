import { and, desc, eq, gte, inArray, isNull, lte, type SQL } from 'drizzle-orm';
import {
  DEFAULT_CURRENCY,
  type Cents,
  type CategorySource,
  type DateKey,
  type MonthKey,
  type PaymentMethod,
  type Transaction,
  type TransactionNature,
  type TransactionStatus,
  type TransactionType,
} from '../../domain/types';
import {
  defaultNature,
  inferTransferNature,
  installmentDates,
  invoiceMonthFor,
  isTransferNature,
  isValidNatureForType,
  refundableAmount,
  splitInstallments,
} from '../../domain/ledger';
import { normalizeMerchant } from '../../domain/merchant';
import { type AppDatabase, type RepositoryContext, timestamp, ValidationError } from '../context';
import { accounts, transactions } from '../schema';

/**
 * A client-generated `id` makes `create` idempotent: saving the same input
 * twice (a double tap, a retry after a failed save) keeps a single row.
 */
export interface NewTransactionInput {
  id?: string;
  accountId: string;
  categoryId?: string | null;
  type: Extract<TransactionType, 'expense' | 'income'>;
  /** Defaults to `expense`/`income` from `type`. Transfers and refunds have their own methods. */
  nature?: Extract<TransactionNature, 'expense' | 'income' | 'investment_return' | 'adjustment'>;
  amount: Cents;
  date: DateKey;
  competenceMonth?: MonthKey | null;
  dueDate?: DateKey | null;
  settledDate?: DateKey | null;
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
    | 'nature'
    | 'amount'
    | 'date'
    | 'description'
    | 'merchant'
    | 'notes'
    | 'paymentMethod'
    | 'status'
    | 'invoiceMonth'
    | 'competenceMonth'
    | 'dueDate'
    | 'settledDate'
    | 'categorySource'
    | 'categoryConfidence'
  >
>;

export interface NewTransferInput {
  /** Client-generated pair id; makes the call idempotent. */
  id?: string;
  fromAccountId: string;
  toAccountId: string;
  amount: Cents;
  date: DateKey;
  description?: string;
  paymentMethod?: PaymentMethod;
  /** Inferred from the account types when omitted (card payment, investment contribution...). */
  nature?: Extract<TransactionNature, 'transfer' | 'card_payment' | 'investment_contribution' | 'investment_withdrawal'>;
}

export interface NewRefundInput {
  /** Client-generated id; makes the call idempotent. */
  id?: string;
  /** The transaction being refunded. */
  refundOfId: string;
  amount: Cents;
  date: DateKey;
  description?: string;
  /** Defaults to the original transaction's account. */
  accountId?: string;
}

export interface NewInstallmentsInput {
  /** Client-generated group id; makes the call idempotent. */
  id?: string;
  accountId: string;
  categoryId?: string | null;
  /** Contracted total, split by `splitInstallments`. */
  total: Cents;
  count: number;
  /** Date of the first installment (usually the purchase date). */
  firstDate: DateKey;
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

function validateOptionalDate(date: DateKey | null | undefined) {
  if (date != null) validateDate(date);
}

function validateNature(nature: TransactionNature, type: TransactionType) {
  if (!isValidNatureForType(nature, type)) throw new ValidationError('Natureza incompatível com o tipo do lançamento.');
}

const MAX_INSTALLMENTS = 120;

function getLive(db: AppDatabase, id: string): Promise<Transaction | undefined> {
  return db
    .select()
    .from(transactions)
    .where(and(eq(transactions.id, id), isNull(transactions.deletedAt)))
    .get();
}

async function getAccount(db: AppDatabase, id: string) {
  const account = await db
    .select()
    .from(accounts)
    .where(and(eq(accounts.id, id), isNull(accounts.deletedAt)))
    .get();
  if (!account) throw new ValidationError('Conta não encontrada.');
  return account;
}

export function createTransactionsRepository(ctx: RepositoryContext) {
  const { db, bus } = ctx;

  function base(now: string): Omit<Transaction, 'id' | 'accountId' | 'type' | 'nature' | 'amount' | 'date'> {
    return {
      categoryId: null,
      currency: DEFAULT_CURRENCY,
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

    /** Refunds linked to a transaction. */
    async listRefunds(refundOfId: string): Promise<Transaction[]> {
      return db
        .select()
        .from(transactions)
        .where(and(eq(transactions.refundOfId, refundOfId), isNull(transactions.deletedAt)));
    },

    /** Every live installment of a group, in order. */
    async listInstallments(installmentGroupId: string): Promise<Transaction[]> {
      const rows = await db
        .select()
        .from(transactions)
        .where(and(eq(transactions.installmentGroupId, installmentGroupId), isNull(transactions.deletedAt)));
      return rows.sort((a, b) => (a.installmentNumber ?? 0) - (b.installmentNumber ?? 0));
    },

    async create(input: NewTransactionInput): Promise<Transaction> {
      validateAmount(input.amount);
      validateDate(input.date);
      validateOptionalDate(input.dueDate);
      validateOptionalDate(input.settledDate);
      const nature = input.nature ?? defaultNature(input.type);
      validateNature(nature, input.type);
      const now = timestamp(ctx);
      const categoryId = input.categoryId ?? null;
      const id = input.id ?? ctx.newId();

      const { row, inserted } = await ctx.write(async (tx) => {
        const existing = await tx.select().from(transactions).where(eq(transactions.id, id)).get();
        if (existing) return { row: existing, inserted: false };
        const account = await getAccount(tx, input.accountId);
        const transaction: Transaction = {
          ...base(now),
          id,
          accountId: input.accountId,
          type: input.type,
          nature,
          amount: input.amount,
          currency: account.currency,
          date: input.date,
          competenceMonth: input.competenceMonth ?? null,
          dueDate: input.dueDate ?? null,
          settledDate: input.settledDate ?? null,
          categoryId,
          description: input.description?.trim() ?? '',
          merchant: input.merchant ?? (normalizeMerchant(input.description ?? '') || null),
          notes: input.notes?.trim() ?? '',
          paymentMethod: input.paymentMethod ?? 'other',
          status: input.status ?? 'cleared',
          invoiceMonth: input.invoiceMonth ?? invoiceMonthFor(account, input.date),
          importBatchId: input.importBatchId ?? null,
          externalId: input.externalId ?? null,
          fingerprint: input.fingerprint ?? null,
          categorySource: input.categorySource ?? (categoryId ? 'manual' : null),
          categoryConfidence: input.categoryConfidence ?? null,
        };
        await tx.insert(transactions).values(transaction);
        return { row: transaction, inserted: true };
      });
      if (inserted) bus.emit('transactions');
      return row;
    },

    /**
     * Updates a transaction. Changing the category without saying who changed
     * it records a manual correction, which is what the AI layer learns from.
     */
    async update(id: string, patch: TransactionPatch): Promise<void> {
      if (patch.amount !== undefined) validateAmount(patch.amount);
      if (patch.date !== undefined) validateDate(patch.date);
      validateOptionalDate(patch.dueDate);
      validateOptionalDate(patch.settledDate);
      await ctx.write(async (tx) => {
        const current = await getLive(tx, id);
        if (!current) throw new ValidationError('Lançamento não encontrado.');
        if (current.transferPairId && (patch.type || patch.accountId || patch.categoryId || patch.nature)) {
          throw new ValidationError('Para mudar uma transferência, exclua e crie novamente.');
        }
        if (current.nature === 'refund' && (patch.type || patch.nature)) {
          throw new ValidationError('Para mudar um estorno, exclua e crie novamente.');
        }
        if (patch.type !== undefined || patch.nature !== undefined) {
          const type = patch.type ?? current.type;
          // Flipping expense <-> income without a nature resets it to the plain one.
          const nature = patch.nature ?? (patch.type && patch.type !== current.type ? defaultNature(type) : current.nature);
          validateNature(nature, type);
          patch = { ...patch, nature: nature as TransactionPatch['nature'] };
        }

        const categoryChanged = patch.categoryId !== undefined && patch.categoryId !== current.categoryId;
        const accountId = patch.accountId ?? current.accountId;
        const date = patch.date ?? current.date;
        const recomputeInvoice =
          patch.invoiceMonth === undefined && (patch.accountId !== undefined || patch.date !== undefined);
        const account = recomputeInvoice ? await getAccount(tx, accountId) : undefined;
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
          ...(account && { invoiceMonth: invoiceMonthFor(account, date), currency: account.currency }),
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

    /**
     * Undoes `remove`: brings back a deleted transaction (both legs, for a
     * transfer). Used by the "Desfazer" of the deletion toast.
     */
    async restore(id: string): Promise<void> {
      const restored = await ctx.write(async (tx) => {
        const row = await tx.select().from(transactions).where(eq(transactions.id, id)).get();
        if (!row || !row.deletedAt) return false;
        await tx
          .update(transactions)
          .set({ deletedAt: null, updatedAt: timestamp(ctx) })
          .where(row.transferPairId ? eq(transactions.transferPairId, row.transferPairId) : eq(transactions.id, id));
        return true;
      });
      if (restored) bus.emit('transactions');
    },

    /** Soft-deletes every installment of a purchase; returns the ids, for undo. */
    async removeInstallmentGroup(installmentGroupId: string): Promise<string[]> {
      const now = timestamp(ctx);
      const ids = await ctx.write(async (tx) => {
        const rows = await tx
          .select({ id: transactions.id })
          .from(transactions)
          .where(and(eq(transactions.installmentGroupId, installmentGroupId), isNull(transactions.deletedAt)));
        if (rows.length === 0) return [];
        await tx
          .update(transactions)
          .set({ deletedAt: now, updatedAt: now })
          .where(and(eq(transactions.installmentGroupId, installmentGroupId), isNull(transactions.deletedAt)));
        return rows.map((r) => r.id);
      });
      if (ids.length > 0) bus.emit('transactions');
      return ids;
    },

    /** Undoes `removeInstallmentGroup` for the given ids. */
    async restoreMany(ids: string[]): Promise<void> {
      if (ids.length === 0) return;
      await ctx.write((tx) =>
        tx.update(transactions).set({ deletedAt: null, updatedAt: timestamp(ctx) }).where(inArray(transactions.id, ids))
      );
      bus.emit('transactions');
    },

    /**
     * Records a transfer between two of the user's accounts as a linked pair
     * of rows. Its nature (plain transfer, card payment, investment
     * contribution or withdrawal) comes from the account types unless given;
     * none of them counts as income or spending.
     */
    async createTransfer(input: NewTransferInput): Promise<{ out: Transaction; in: Transaction }> {
      validateAmount(input.amount);
      validateDate(input.date);
      if (input.fromAccountId === input.toAccountId) {
        throw new ValidationError('Escolha contas diferentes para a transferência.');
      }
      if (input.nature && !isTransferNature(input.nature)) throw new ValidationError('Natureza inválida para transferência.');
      const now = timestamp(ctx);
      const pairId = input.id ?? ctx.newId();

      const { legs, inserted } = await ctx.write(async (tx) => {
        const existing = await tx.select().from(transactions).where(eq(transactions.transferPairId, pairId));
        const out0 = existing.find((t) => t.type === 'transfer_out');
        const in0 = existing.find((t) => t.type === 'transfer_in');
        if (out0 && in0) return { legs: { out: out0, in: in0 }, inserted: false };

        const [from, to] = [await getAccount(tx, input.fromAccountId), await getAccount(tx, input.toAccountId)];
        if (from.currency !== to.currency) {
          throw new ValidationError('Transferência entre moedas diferentes ainda não é suportada.');
        }
        const common = {
          ...base(now),
          nature: input.nature ?? inferTransferNature(from.type, to.type),
          amount: input.amount,
          currency: from.currency,
          date: input.date,
          description: input.description?.trim() ?? '',
          paymentMethod: input.paymentMethod ?? 'transfer',
          transferPairId: pairId,
        };
        const out: Transaction = { ...common, id: ctx.newId(), accountId: from.id, type: 'transfer_out' };
        const inn: Transaction = { ...common, id: ctx.newId(), accountId: to.id, type: 'transfer_in' };
        await tx.insert(transactions).values([out, inn]);
        return { legs: { out, in: inn }, inserted: true };
      });
      if (inserted) bus.emit('transactions');
      return legs;
    },

    /**
     * Records a refund (estorno/reembolso) linked to the original transaction:
     * the opposite direction, same category, so it reduces that category's
     * spending instead of counting as income. Refunds can't add up to more
     * than the original amount, so the same correction is never applied twice.
     */
    async createRefund(input: NewRefundInput): Promise<Transaction> {
      validateAmount(input.amount);
      validateDate(input.date);
      const now = timestamp(ctx);
      const id = input.id ?? ctx.newId();

      const { row, inserted } = await ctx.write(async (tx) => {
        const existing = await tx.select().from(transactions).where(eq(transactions.id, id)).get();
        if (existing) return { row: existing, inserted: false };
        const origin = await getLive(tx, input.refundOfId);
        if (!origin) throw new ValidationError('Lançamento original não encontrado.');
        if (origin.type !== 'expense' && origin.type !== 'income') {
          throw new ValidationError('Transferências não têm estorno; exclua ou edite a transferência.');
        }
        if (origin.nature === 'refund') throw new ValidationError('Não é possível estornar um estorno.');
        const previous = await tx
          .select()
          .from(transactions)
          .where(and(eq(transactions.refundOfId, origin.id), isNull(transactions.deletedAt)));
        if (input.amount > refundableAmount(origin, previous)) {
          throw new ValidationError('O estorno não pode passar do valor que ainda resta do lançamento original.');
        }
        const account = await getAccount(tx, input.accountId ?? origin.accountId);
        const refund: Transaction = {
          ...base(now),
          id,
          accountId: account.id,
          type: origin.type === 'expense' ? 'income' : 'expense',
          nature: 'refund',
          refundOfId: origin.id,
          amount: input.amount,
          currency: origin.currency,
          date: input.date,
          categoryId: origin.categoryId,
          categorySource: origin.categoryId ? 'manual' : null,
          description: input.description?.trim() || `Estorno: ${origin.description}`.trim(),
          merchant: origin.merchant,
          paymentMethod: origin.paymentMethod,
          invoiceMonth: invoiceMonthFor(account, input.date),
        };
        await tx.insert(transactions).values(refund);
        return { row: refund, inserted: true };
      });
      if (inserted) bus.emit('transactions');
      return row;
    },

    /**
     * Records an installment purchase as one row per installment, linked by a
     * group id. Amounts add up exactly to the total (leftover cents on the
     * first); each installment counts in its own month's budget (D-008).
     */
    async createInstallments(input: NewInstallmentsInput): Promise<Transaction[]> {
      validateAmount(input.total);
      validateDate(input.firstDate);
      if (!Number.isInteger(input.count) || input.count < 2 || input.count > MAX_INSTALLMENTS) {
        throw new ValidationError(`Informe de 2 a ${MAX_INSTALLMENTS} parcelas.`);
      }
      if (input.count > input.total) throw new ValidationError('Valor pequeno demais para esse número de parcelas.');
      const now = timestamp(ctx);
      const groupId = input.id ?? ctx.newId();
      const amounts = splitInstallments(input.total, input.count);
      const dates = installmentDates(input.firstDate, input.count);
      const categoryId = input.categoryId ?? null;
      const description = input.description?.trim() ?? '';

      const { rows, inserted } = await ctx.write(async (tx) => {
        const existing = await tx.select().from(transactions).where(eq(transactions.installmentGroupId, groupId));
        if (existing.length > 0) return { rows: existing, inserted: false };
        const account = await getAccount(tx, input.accountId);
        const created: Transaction[] = amounts.map((amount, i) => ({
          ...base(now),
          id: ctx.newId(),
          accountId: account.id,
          type: 'expense',
          nature: 'expense',
          amount,
          currency: account.currency,
          date: dates[i],
          categoryId,
          categorySource: categoryId ? 'manual' : null,
          description,
          merchant: normalizeMerchant(description) || null,
          paymentMethod: input.paymentMethod ?? (account.type === 'credit_card' ? 'credit' : 'other'),
          installmentGroupId: groupId,
          installmentNumber: i + 1,
          installmentTotal: input.count,
          invoiceMonth: invoiceMonthFor(account, dates[i]),
        }));
        await tx.insert(transactions).values(created);
        return { rows: created, inserted: true };
      });
      if (inserted) bus.emit('transactions');
      return rows.sort((a, b) => (a.installmentNumber ?? 0) - (b.installmentNumber ?? 0));
    },
  };
}

export type TransactionsRepository = ReturnType<typeof createTransactionsRepository>;
