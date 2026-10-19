// Monetary amounts are stored as integer cents to avoid floating point drift.
export type Cents = number;

/** ISO 4217 code. Amounts in different currencies are never summed without an explicit conversion. */
export type CurrencyCode = string;
export const DEFAULT_CURRENCY: CurrencyCode = 'BRL';

/** Calendar date as YYYY-MM-DD (local, no time component). */
export type DateKey = string;

/** Calendar month as YYYY-MM. */
export type MonthKey = string;

/**
 * Columns every persisted entity carries. UUID ids, `updatedAt` and soft
 * deletes (`deletedAt`) are what make a future multi-device sync possible
 * without reshaping the data.
 */
export interface SyncFields {
  id: string;
  createdAt: string; // ISO timestamp
  updatedAt: string; // ISO timestamp
  deletedAt: string | null; // ISO timestamp, null while the row is live
}

export const ACCOUNT_TYPES = ['checking', 'savings', 'wallet', 'credit_card', 'investment', 'other'] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

export interface Account extends SyncFields {
  name: string;
  type: AccountType;
  /** Institution slug (see `institutions.ts`), null for e.g. a cash wallet. */
  institution: string | null;
  color: string;
  /** Balance before the first transaction recorded in the app. Negative for card debt. */
  initialBalance: Cents;
  /** Credit cards only. */
  creditLimit: Cents | null;
  /** Credit cards only: day of month the invoice closes (1-31). */
  closingDay: number | null;
  /** Credit cards only: day of month the invoice is due (1-31). */
  dueDay: number | null;
  /** Credit cards only: account that usually pays the invoice (informational, never moves money by itself). */
  paymentAccountId: string | null;
  currency: CurrencyCode;
  archived: boolean;
  sortOrder: number;
}

export const CATEGORY_KINDS = ['expense', 'income'] as const;
export type CategoryKind = (typeof CATEGORY_KINDS)[number];

export interface Category extends SyncFields {
  /** Parent category for subcategories (one level deep), null for top-level ones. */
  parentId: string | null;
  name: string;
  kind: CategoryKind;
  color: string;
  /** Icon key (see `ICONS` in src/ui/icons.tsx; Ionicons-style names, drawn with Lucide). */
  icon: string;
  /** True for categories shipped with the app (seeded), false for user-created ones. */
  isSystem: boolean;
  /** Archived categories are no longer offered for new entries; their history and totals stay. */
  archived: boolean;
  sortOrder: number;
}

export interface Budget extends SyncFields {
  categoryId: string;
  /** Month this budget applies to, or null for the default used every month. */
  month: MonthKey | null;
  amount: Cents;
}

/**
 * Transfers between the user's own accounts are stored as a pair of rows
 * (`transfer_out` on the source, `transfer_in` on the destination) linked by
 * `transferPairId`, so each account's balance is just the sum of its rows and
 * transfers never count as spending or income.
 */
export const TRANSACTION_TYPES = ['expense', 'income', 'transfer_out', 'transfer_in'] as const;
export type TransactionType = (typeof TRANSACTION_TYPES)[number];

/**
 * What a transaction *is*, independent of which way the money moves (`type`)
 * or how it was paid (`paymentMethod`). Only `income` and `expense` (net of
 * `refund`) count as income or spending; every other nature only moves money
 * between the user's own pockets or corrects a balance. See `ledger.ts`.
 */
export const TRANSACTION_NATURES = [
  'expense',
  'income',
  /** Between two own accounts. */
  'transfer',
  /** Settles a credit card invoice; the purchases were already counted as expenses. */
  'card_payment',
  /** Money put into an investment account (aporte): not consumption. */
  'investment_contribution',
  /** Money taken out of an investment account (resgate): not income. */
  'investment_withdrawal',
  /** Investment yield or appreciation: tracked apart, not available income by default. */
  'investment_return',
  /** Reverses (part of) another transaction, linked by `refundOfId`. */
  'refund',
  /** Balance correction: never income or spending. */
  'adjustment',
] as const;
export type TransactionNature = (typeof TRANSACTION_NATURES)[number];

export const PAYMENT_METHODS = ['pix', 'boleto', 'debit', 'credit', 'cash', 'transfer', 'other'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const TRANSACTION_STATUSES = ['cleared', 'pending'] as const;
export type TransactionStatus = (typeof TRANSACTION_STATUSES)[number];

/** Who assigned the category, so the AI layer can learn from manual corrections. */
export const CATEGORY_SOURCES = ['manual', 'rule', 'local_model', 'ai', 'import'] as const;
export type CategorySource = (typeof CATEGORY_SOURCES)[number];

export interface Transaction extends SyncFields {
  accountId: string;
  /** Null means "a classificar" (not categorized yet). */
  categoryId: string | null;
  /** Direction of the money on `accountId`. */
  type: TransactionType;
  nature: TransactionNature;
  amount: Cents; // always stored positive; sign is derived from `type`
  currency: CurrencyCode;
  /** When it happened: purchase date, or the date the money moved. */
  date: DateKey;
  /** Month it refers to, when different from `date` (e.g. salary for March paid on April 5th). */
  competenceMonth: MonthKey | null;
  /** When it is due (bills, invoices), if known. */
  dueDate: DateKey | null;
  /** When it was actually settled, if different from `date`. */
  settledDate: DateKey | null;
  /** For refunds: the transaction being reversed. */
  refundOfId: string | null;
  /** Description as typed by the user or as it came from the bank statement. */
  description: string;
  /** Normalized merchant name (e.g. "IFOOD" for "IFD*IFOOD SAO PAULO"), used for learning. */
  merchant: string | null;
  notes: string;
  paymentMethod: PaymentMethod;
  status: TransactionStatus;
  /** Installment purchases ("3x de R$ 100") share a group id. */
  installmentGroupId: string | null;
  installmentNumber: number | null;
  installmentTotal: number | null;
  transferPairId: string | null;
  /** Credit cards only: invoice (YYYY-MM of its due date) this purchase belongs to. */
  invoiceMonth: MonthKey | null;
  importBatchId: string | null;
  /** Id assigned by the bank (e.g. OFX FITID), used to skip duplicates on re-import. */
  externalId: string | null;
  /** Hash of account+date+amount+description, used to skip duplicates when there is no externalId. */
  fingerprint: string | null;
  categorySource: CategorySource | null;
  /** 0-1 confidence of an automatic categorization. */
  categoryConfidence: number | null;
}

export type AlertLevel = 'ok' | 'warning' | 'projected_overrun' | 'exceeded';

export interface CategoryMonthlyAlert {
  categoryId: string;
  categoryName: string;
  level: AlertLevel;
  budget: Cents;
  spentSoFar: Cents;
  projectedMonthTotal: Cents;
  /** spentSoFar / budget, e.g. 0.8 for 80%. Can exceed 1. */
  percentOfBudgetUsed: number;
  /** projectedMonthTotal / budget. Can exceed 1. */
  percentOfBudgetProjected: number;
}

export interface ForecastPoint {
  categoryId: string;
  categoryName: string;
  dailyAverage: Cents;
  monthSpentSoFar: Cents;
  projectedMonthTotal: Cents;
  yearSpentSoFar: Cents;
  projectedYearTotal: Cents;
}
