import { addMonths, addMonthsToDateKey, dayOfMonthKey } from './dates';
import {
  DEFAULT_CURRENCY,
  type Account,
  type AccountType,
  type Cents,
  type CurrencyCode,
  type DateKey,
  type MonthKey,
  type Transaction,
  type TransactionNature,
  type TransactionType,
} from './types';

// The single place that decides what counts as income, spending or neither,
// and how balances add up. Screens, filters, alerts, forecasts and the
// assistant all go through here, so they can't disagree (briefing §9).

/** The transaction fields the ledger looks at, so callers (and tests) can pass partial rows. */
export type LedgerEntry = Pick<Transaction, 'type' | 'nature' | 'amount'> &
  Partial<Pick<Transaction, 'categoryId' | 'currency'>>;

/**
 * How a transaction affects the period result:
 * - `income` / `expense`: counted as such;
 * - `refund`: reduces spending (a refund of a purchase) or income (a reversed income);
 * - `neutral`: moves money between own accounts, settles a card invoice,
 *   invests, redeems, yields or corrects a balance. Never income or spending.
 */
export type ResultEffect = 'income' | 'expense' | 'refund_of_expense' | 'refund_of_income' | 'neutral';

export function resultEffect(t: Pick<Transaction, 'type' | 'nature'>): ResultEffect {
  switch (t.nature) {
    case 'income':
      return 'income';
    case 'expense':
      return 'expense';
    case 'refund':
      return t.type === 'income' ? 'refund_of_expense' : 'refund_of_income';
    default:
      return 'neutral';
  }
}

/** Natures that only move money between the user's own accounts. */
export const TRANSFER_NATURES: readonly TransactionNature[] = [
  'transfer',
  'card_payment',
  'investment_contribution',
  'investment_withdrawal',
];

export function isTransferNature(nature: TransactionNature): boolean {
  return TRANSFER_NATURES.includes(nature);
}

/** Which directions (`type`) each nature allows. Transfers are always a pair of legs. */
const ALLOWED_TYPES: Record<TransactionNature, readonly TransactionType[]> = {
  expense: ['expense'],
  income: ['income'],
  transfer: ['transfer_out', 'transfer_in'],
  card_payment: ['transfer_out', 'transfer_in'],
  investment_contribution: ['transfer_out', 'transfer_in'],
  investment_withdrawal: ['transfer_out', 'transfer_in'],
  investment_return: ['income', 'expense'],
  refund: ['income', 'expense'],
  adjustment: ['income', 'expense'],
};

export function isValidNatureForType(nature: TransactionNature, type: TransactionType): boolean {
  return ALLOWED_TYPES[nature].includes(type);
}

/** The nature a plain income/expense gets when none is given. */
export function defaultNature(type: TransactionType): TransactionNature {
  if (type === 'income') return 'income';
  if (type === 'expense') return 'expense';
  return 'transfer';
}

/**
 * Nature of a transfer between two own accounts, from the account types.
 * Conservative: anything not clearly a card payment or an investment move
 * stays a plain transfer.
 */
export function inferTransferNature(fromType: AccountType | undefined, toType: AccountType | undefined): TransactionNature {
  if (toType === 'credit_card' && fromType !== 'credit_card') return 'card_payment';
  if (toType === 'investment' && fromType !== 'investment') return 'investment_contribution';
  if (fromType === 'investment' && toType !== 'investment') return 'investment_withdrawal';
  return 'transfer';
}

/** Effect of a transaction on its own account's balance. */
export function balanceDelta(t: Pick<Transaction, 'type' | 'amount'>): Cents {
  return t.type === 'income' || t.type === 'transfer_in' ? t.amount : -t.amount;
}

export interface PeriodTotals {
  currency: CurrencyCode;
  /** Income, minus reversed incomes. */
  income: Cents;
  /** Spending, minus refunds. */
  expenses: Cents;
  /** Refunds already subtracted from `expenses`, shown for transparency. */
  refunds: Cents;
  /** income - expenses. */
  result: Cents;
  /**
   * Natures that don't count as income or spending: for transfers, the amount
   * moved (counted once, by the outgoing leg); for yields and adjustments, the
   * signed effect on the balance.
   */
  neutral: Partial<Record<TransactionNature, Cents>>;
  /** Transactions considered (all natures, one per leg). */
  count: number;
  /** Rows in another currency, left out instead of being summed without conversion. */
  otherCurrencyCount: number;
}

/**
 * Income, spending and result of a set of transactions. Transfers, card
 * payments, investment moves, yields and adjustments are reported apart and
 * never change the result; a transfer is counted once (its outgoing leg).
 */
export function summarizePeriod(entries: LedgerEntry[], currency: CurrencyCode = DEFAULT_CURRENCY): PeriodTotals {
  const totals: PeriodTotals = {
    currency,
    income: 0,
    expenses: 0,
    refunds: 0,
    result: 0,
    neutral: {},
    count: 0,
    otherCurrencyCount: 0,
  };
  for (const t of entries) {
    if ((t.currency ?? DEFAULT_CURRENCY) !== currency) {
      totals.otherCurrencyCount++;
      continue;
    }
    totals.count++;
    switch (resultEffect(t)) {
      case 'income':
        totals.income += t.amount;
        break;
      case 'expense':
        totals.expenses += t.amount;
        break;
      case 'refund_of_expense':
        totals.expenses -= t.amount;
        totals.refunds += t.amount;
        break;
      case 'refund_of_income':
        totals.income -= t.amount;
        break;
      case 'neutral':
        if (t.type === 'transfer_in') break;
        totals.neutral[t.nature] = (totals.neutral[t.nature] ?? 0) + (t.type === 'expense' ? -t.amount : t.amount);
        break;
    }
  }
  totals.result = totals.income - totals.expenses;
  return totals;
}

/** Spending per category id (null = uncategorized), net of refunds. Ignores other natures. */
export function expensesByCategory(entries: LedgerEntry[], currency: CurrencyCode = DEFAULT_CURRENCY): Map<string | null, Cents> {
  const result = new Map<string | null, Cents>();
  for (const t of entries) {
    if ((t.currency ?? DEFAULT_CURRENCY) !== currency) continue;
    const effect = resultEffect(t);
    const sign = effect === 'expense' ? 1 : effect === 'refund_of_expense' ? -1 : 0;
    if (sign === 0) continue;
    const key = t.categoryId ?? null;
    result.set(key, (result.get(key) ?? 0) + sign * t.amount);
  }
  return result;
}

/** Spending (net of refunds) of a set of transactions; the same rule as `summarizePeriod`. */
export function netExpenses(entries: LedgerEntry[], currency: CurrencyCode = DEFAULT_CURRENCY): Cents {
  return summarizePeriod(entries, currency).expenses;
}

/** Signed effect on the period result: + income, - spending, 0 for neutral natures. */
export function resultDelta(t: Pick<Transaction, 'type' | 'nature' | 'amount'>): Cents {
  switch (resultEffect(t)) {
    case 'income':
    case 'refund_of_expense':
      return t.amount;
    case 'expense':
    case 'refund_of_income':
      return -t.amount;
    default:
      return 0;
  }
}

// ---- Balances ----

/**
 * - available: money the user can spend (checking, savings, wallet, other);
 * - investments: invested balances, not counted as available;
 * - credit_card: card balances (negative = invoice owed). A card's limit is never a balance.
 */
export type BalanceGroup = 'available' | 'investments' | 'credit_card';

export function balanceGroup(type: AccountType): BalanceGroup {
  if (type === 'investment') return 'investments';
  if (type === 'credit_card') return 'credit_card';
  return 'available';
}

export interface BalanceSummary {
  currency: CurrencyCode;
  available: Cents;
  investments: Cents;
  /** Sum of card balances: negative while invoices are owed. */
  creditCards: Cents;
  /** available + investments + creditCards. */
  netWorth: Cents;
  otherCurrencyCount: number;
}

export function summarizeBalances(
  accounts: Pick<Account, 'id' | 'type' | 'currency'>[],
  balances: Map<string, Cents>,
  currency: CurrencyCode = DEFAULT_CURRENCY
): BalanceSummary {
  const summary: BalanceSummary = { currency, available: 0, investments: 0, creditCards: 0, netWorth: 0, otherCurrencyCount: 0 };
  for (const a of accounts) {
    if ((a.currency ?? DEFAULT_CURRENCY) !== currency) {
      summary.otherCurrencyCount++;
      continue;
    }
    const balance = balances.get(a.id) ?? 0;
    const group = balanceGroup(a.type);
    if (group === 'available') summary.available += balance;
    else if (group === 'investments') summary.investments += balance;
    else summary.creditCards += balance;
  }
  summary.netWorth = summary.available + summary.investments + summary.creditCards;
  return summary;
}

// ---- Credit cards ----

export interface InvoiceRef {
  /** YYYY-MM of the due date; identifies the invoice. */
  month: MonthKey;
  closingDate: DateKey;
  dueDate: DateKey;
}

/**
 * The invoice a card purchase falls into. Purchases on or after the closing
 * day go to the next invoice (decision D-013). The due date is in the closing
 * month when `dueDay` comes after `closingDay`, otherwise in the next month.
 * Days past a month's end are clamped (closing day 31 in February = Feb 28/29).
 */
export function invoiceFor(purchaseDate: DateKey, closingDay: number, dueDay: number): InvoiceRef {
  const purchaseMonth = purchaseDate.slice(0, 7);
  const closingThisMonth = dayOfMonthKey(purchaseMonth, closingDay);
  const closingMonth = purchaseDate < closingThisMonth ? purchaseMonth : addMonths(purchaseMonth, 1);
  const dueMonth = dueDay > closingDay ? closingMonth : addMonths(closingMonth, 1);
  return {
    month: dueMonth,
    closingDate: dayOfMonthKey(closingMonth, closingDay),
    dueDate: dayOfMonthKey(dueMonth, dueDay),
  };
}

/** Invoice month for a purchase on `account`, or null when it isn't a card with closing and due days. */
export function invoiceMonthFor(
  account: Pick<Account, 'type' | 'closingDay' | 'dueDay'> | undefined,
  purchaseDate: DateKey
): MonthKey | null {
  if (!account || account.type !== 'credit_card' || !account.closingDay || !account.dueDay) return null;
  return invoiceFor(purchaseDate, account.closingDay, account.dueDay).month;
}

// ---- Installments ----

/**
 * Splits `total` into `count` installments that add up exactly to `total`.
 * The leftover cents go to the first installment (decision D-008):
 * R$ 100,00 in 3x = 33,34 + 33,33 + 33,33.
 */
export function splitInstallments(total: Cents, count: number): Cents[] {
  if (!Number.isSafeInteger(total) || total <= 0) throw new RangeError('total must be a positive integer of cents');
  if (!Number.isInteger(count) || count < 1) throw new RangeError('count must be a positive integer');
  if (count > total) throw new RangeError('more installments than cents');
  const base = Math.floor(total / count);
  const remainder = total - base * count;
  return Array.from({ length: count }, (_, i) => (i === 0 ? base + remainder : base));
}

/** Dates of each installment: the first date, then the same day in the following months (clamped). */
export function installmentDates(firstDate: DateKey, count: number): DateKey[] {
  return Array.from({ length: count }, (_, i) => addMonthsToDateKey(firstDate, i));
}

export interface InstallmentProgress {
  /** Contracted total (sum of all installments). */
  total: Cents;
  count: number;
  /** Installments dated up to `asOf`. */
  dueSoFar: number;
  /** Amount of installments dated after `asOf`: future commitments. */
  remaining: Cents;
}

/**
 * Progress of one installment group. Budgets recognize each installment in
 * its own month (decision D-008); this keeps the contracted total visible.
 */
export function installmentProgress(
  installments: Pick<Transaction, 'amount' | 'date'>[],
  asOf: DateKey
): InstallmentProgress {
  let total = 0;
  let remaining = 0;
  let dueSoFar = 0;
  for (const i of installments) {
    total += i.amount;
    if (i.date <= asOf) dueSoFar++;
    else remaining += i.amount;
  }
  return { total, count: installments.length, dueSoFar, remaining };
}

// ---- Refunds ----

/** How much of `origin` can still be refunded, given the refunds already linked to it. */
export function refundableAmount(
  origin: Pick<Transaction, 'amount'>,
  existingRefunds: Pick<Transaction, 'amount'>[]
): Cents {
  return Math.max(0, origin.amount - existingRefunds.reduce((sum, r) => sum + r.amount, 0));
}
