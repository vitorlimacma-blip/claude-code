import { sql } from 'drizzle-orm';
import { index, integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import {
  ACCOUNT_TYPES,
  CATEGORY_KINDS,
  CATEGORY_SOURCES,
  DEFAULT_CURRENCY,
  PAYMENT_METHODS,
  TRANSACTION_NATURES,
  TRANSACTION_STATUSES,
  TRANSACTION_TYPES,
} from '../domain/types';

// Schema changes: edit this file, then run `npm run db:generate` to create a
// new migration in `drizzle/` and refresh `src/data/migrations.generated.ts`.
// Never edit an already-generated migration: devices that ran it won't re-run it.
//
// There are deliberately no SQL foreign keys: rows are soft-deleted rather than
// removed, and once sync exists they may arrive out of order from another
// device. Referential rules live in the repositories instead.

/** Columns every table carries; see `SyncFields` in the domain types. */
const syncColumns = {
  id: text('id').primaryKey().notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  deletedAt: text('deleted_at'),
};

export const accounts = sqliteTable('accounts', {
  ...syncColumns,
  name: text('name').notNull(),
  type: text('type', { enum: ACCOUNT_TYPES }).notNull(),
  institution: text('institution'),
  color: text('color').notNull(),
  initialBalance: integer('initial_balance').notNull().default(0),
  creditLimit: integer('credit_limit'),
  closingDay: integer('closing_day'),
  dueDay: integer('due_day'),
  paymentAccountId: text('payment_account_id'),
  currency: text('currency').notNull().default(DEFAULT_CURRENCY),
  archived: integer('archived', { mode: 'boolean' }).notNull().default(false),
  sortOrder: integer('sort_order').notNull().default(0),
});

export const categories = sqliteTable(
  'categories',
  {
    ...syncColumns,
    parentId: text('parent_id'),
    name: text('name').notNull(),
    kind: text('kind', { enum: CATEGORY_KINDS }).notNull(),
    color: text('color').notNull(),
    icon: text('icon').notNull(),
    isSystem: integer('is_system', { mode: 'boolean' }).notNull().default(false),
    /** Hidden from pickers; its history and totals stay. */
    archived: integer('archived', { mode: 'boolean' }).notNull().default(false),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (t) => [index('categories_parent_idx').on(t.parentId)]
);

export const budgets = sqliteTable(
  'budgets',
  {
    ...syncColumns,
    categoryId: text('category_id').notNull(),
    month: text('month'),
    amount: integer('amount').notNull(),
  },
  (t) => [index('budgets_category_idx').on(t.categoryId, t.month)]
);

export const transactions = sqliteTable(
  'transactions',
  {
    ...syncColumns,
    accountId: text('account_id').notNull(),
    categoryId: text('category_id'),
    type: text('type', { enum: TRANSACTION_TYPES }).notNull(),
    // Existing rows get their real nature from `applyDataMigrations` in setup.ts.
    nature: text('nature', { enum: TRANSACTION_NATURES }).notNull().default('expense'),
    amount: integer('amount').notNull(),
    currency: text('currency').notNull().default(DEFAULT_CURRENCY),
    date: text('date').notNull(),
    competenceMonth: text('competence_month'),
    dueDate: text('due_date'),
    settledDate: text('settled_date'),
    refundOfId: text('refund_of_id'),
    description: text('description').notNull().default(''),
    merchant: text('merchant'),
    notes: text('notes').notNull().default(''),
    paymentMethod: text('payment_method', { enum: PAYMENT_METHODS }).notNull().default('other'),
    status: text('status', { enum: TRANSACTION_STATUSES }).notNull().default('cleared'),
    installmentGroupId: text('installment_group_id'),
    installmentNumber: integer('installment_number'),
    installmentTotal: integer('installment_total'),
    transferPairId: text('transfer_pair_id'),
    invoiceMonth: text('invoice_month'),
    importBatchId: text('import_batch_id'),
    externalId: text('external_id'),
    fingerprint: text('fingerprint'),
    categorySource: text('category_source', { enum: CATEGORY_SOURCES }),
    categoryConfidence: real('category_confidence'),
  },
  (t) => [
    index('transactions_date_idx').on(t.date),
    index('transactions_account_date_idx').on(t.accountId, t.date),
    index('transactions_category_idx').on(t.categoryId),
    index('transactions_fingerprint_idx').on(t.fingerprint),
    index('transactions_refund_of_idx').on(t.refundOfId),
    index('transactions_live_idx').on(t.deletedAt).where(sql`${t.deletedAt} IS NULL`),
  ]
);

/** Key/value app settings; values are JSON-encoded. */
export const settings = sqliteTable('settings', {
  key: text('key').primaryKey().notNull(),
  value: text('value').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const schema = { accounts, categories, budgets, transactions, settings };
