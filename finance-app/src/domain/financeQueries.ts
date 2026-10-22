import { rootCategoryIds } from './categories';
import { DEFAULT_TIME_ZONE, todayKey } from './dates';
import { resultEffect, summarizePeriod } from './ledger';
import { allOccurrences, reconcile } from './recurrence';
import {
  DEFAULT_CURRENCY,
  type Account,
  type Category,
  type Cents,
  type CurrencyCode,
  type DateKey,
  type Goal,
  type Recurrence,
  type Reserve,
  type Transaction,
} from './types';

// Calculations behind the assistant's financial tools (AI contract §4). Pure
// and deterministic: the code calculates, the model only explains. Every
// result says what it covers (period, reference date, regime, records) and
// what it does not (completeness, assumptions, missing data).

export type Completeness = 'complete' | 'partial' | 'missing';

/**
 * Two views of the same events (contract §4, semantics 3):
 * - consumption: the app's ledger. A card purchase counts on its date, each
 *   installment in its own month, and paying the invoice only settles it.
 * - cash: money leaving or entering bank accounts. The invoice payment is the
 *   outflow; card purchases don't count again.
 */
export type Regime = 'consumption' | 'cash';

const live = (rows: Transaction[]) => rows.filter((t) => !t.deletedAt);
const inRange = (t: Pick<Transaction, 'date'>, from: DateKey, to: DateKey) => t.date >= from && t.date <= to;

/** Whether recorded history covers `from`–`to`: no records before the period means "not known", never zero. */
export function coverage(rows: Transaction[], from: DateKey, to: DateKey): { status: Completeness; firstDate: DateKey | null } {
  const dates = live(rows).map((t) => t.date).sort();
  const firstDate = dates[0] ?? null;
  if (firstDate === null || firstDate > to) return { status: 'missing', firstDate };
  return { status: firstDate > from ? 'partial' : 'complete', firstDate };
}

/** Category ids under `rootIds` (the roots themselves included). */
export function withSubcategories(categories: Category[], rootIds: string[]): Set<string> {
  const roots = rootCategoryIds(categories);
  const wanted = new Set(rootIds);
  return new Set(categories.filter((c) => wanted.has(c.id) || wanted.has(roots.get(c.id) ?? c.id)).map((c) => c.id));
}

export interface SpendingSummary {
  regime: Regime;
  currency: CurrencyCode;
  income: Cents;
  expensesGross: Cents;
  refunds: Cents;
  expensesNet: Cents;
  result: Cents;
  /** Records that produced the numbers. */
  transactionIds: string[];
  /** Records in another currency, left out (never summed without an exchange rate). */
  otherCurrencyIds: string[];
}

export function spendingSummary(input: {
  rows: Transaction[];
  accounts: Account[];
  from: DateKey;
  to: DateKey;
  regime: Regime;
  /** Restrict spending to these categories (and their subcategories). */
  categoryIds?: Set<string> | null;
  currency?: CurrencyCode;
}): SpendingSummary {
  const currency = input.currency ?? DEFAULT_CURRENCY;
  const cards = new Set(input.accounts.filter((a) => a.type === 'credit_card').map((a) => a.id));
  const period = live(input.rows).filter((t) => inRange(t, input.from, input.to));
  const otherCurrencyIds = period.filter((t) => (t.currency ?? DEFAULT_CURRENCY) !== currency).map((t) => t.id);
  const rows = period.filter((t) => (t.currency ?? DEFAULT_CURRENCY) === currency);
  const inCategory = (t: Transaction) => !input.categoryIds || (t.categoryId !== null && input.categoryIds.has(t.categoryId));

  let income = 0;
  let gross = 0;
  let refunds = 0;
  const ids: string[] = [];
  for (const t of rows) {
    const effect = resultEffect(t);
    const onCard = cards.has(t.accountId);
    if (input.regime === 'cash') {
      if (onCard) continue;
      // The invoice payment is the bank outflow for card spending (no category).
      if (t.nature === 'card_payment' && t.type === 'transfer_out') {
        if (input.categoryIds) continue;
        gross += t.amount;
        ids.push(t.id);
        continue;
      }
    }
    if (effect === 'neutral' || !inCategory(t)) continue;
    if (effect === 'income') income += t.amount;
    else if (effect === 'expense') gross += t.amount;
    else if (effect === 'refund_of_expense') refunds += t.amount;
    else income -= t.amount;
    ids.push(t.id);
  }
  // Income is only reported for the whole ledger, not per spending category.
  if (input.categoryIds) income = 0;
  const net = gross - refunds;
  return { regime: input.regime, currency, income, expensesGross: gross, refunds, expensesNet: net, result: income - net, transactionIds: ids, otherCurrencyIds };
}

export interface AccountBalance {
  accountId: string;
  name: string;
  type: Account['type'];
  currency: CurrencyCode;
  balance: Cents;
  /** Set aside (emergency, goals): part of the balance, not free. */
  reserved: Cents;
  free: Cents;
}

export interface BalancesResult {
  accounts: AccountBalance[];
  /** Totals per currency; different currencies are never added together. */
  totals: { currency: CurrencyCode; balance: Cents; reserved: Cents; free: Cents }[];
}

export function accountBalances(accounts: Account[], balances: Map<string, Cents>, reserves: Reserve[], scope?: Set<string> | null): BalancesResult {
  const reservedBy = new Map<string, Cents>();
  for (const r of reserves) if (!r.deletedAt) reservedBy.set(r.accountId, (reservedBy.get(r.accountId) ?? 0) + r.amount);
  const rows = accounts
    .filter((a) => !a.deletedAt && (!scope || scope.has(a.id)))
    .map((a) => {
      const balance = balances.get(a.id) ?? 0;
      const reserved = reservedBy.get(a.id) ?? 0;
      return { accountId: a.id, name: a.name, type: a.type, currency: a.currency ?? DEFAULT_CURRENCY, balance, reserved, free: balance - reserved };
    });
  const totals = new Map<CurrencyCode, { currency: CurrencyCode; balance: Cents; reserved: Cents; free: Cents }>();
  for (const r of rows) {
    const t = totals.get(r.currency) ?? { currency: r.currency, balance: 0, reserved: 0, free: 0 };
    t.balance += r.balance;
    t.reserved += r.reserved;
    t.free += r.free;
    totals.set(r.currency, t);
  }
  return { accounts: rows, totals: [...totals.values()] };
}

/**
 * Change from `base` to `current` in percent, two decimals, rounded half away
 * from zero. Null when the base is zero: the increase is shown in reais only.
 */
export function percentChange(base: Cents, current: Cents): string | null {
  if (base === 0) return null;
  const hundredths = (BigInt(current - base) * 10000n * 2n) / BigInt(base);
  const rounded = hundredths >= 0n ? (hundredths + 1n) / 2n : (hundredths - 1n) / 2n;
  const sign = rounded < 0n ? '-' : '';
  const abs = rounded < 0n ? -rounded : rounded;
  return `${sign}${abs / 100n}.${String(abs % 100n).padStart(2, '0')}`;
}

export interface BudgetDeviation {
  categoryId: string;
  actual: Cents;
  budget: Cents;
  /** actual − budget: positive means over budget. */
  deviation: Cents;
  /** Of the budget, null when the budget is zero. */
  deviationPercent: string | null;
  transactionIds: string[];
}

/** Realized net spending against the budget of the same period, per budgeted category (with subcategories). */
export function budgetDeviations(input: {
  categories: Category[];
  budgets: Map<string, Cents>;
  rows: Transaction[];
  accounts: Account[];
  from: DateKey;
  to: DateKey;
  onlyCategoryIds?: Set<string> | null;
}): BudgetDeviation[] {
  const out: BudgetDeviation[] = [];
  for (const [categoryId, budget] of input.budgets) {
    if (input.onlyCategoryIds && !input.onlyCategoryIds.has(categoryId)) continue;
    const summary = spendingSummary({
      rows: input.rows,
      accounts: input.accounts,
      from: input.from,
      to: input.to,
      regime: 'consumption',
      categoryIds: withSubcategories(input.categories, [categoryId]),
    });
    out.push({
      categoryId,
      actual: summary.expensesNet,
      budget,
      deviation: summary.expensesNet - budget,
      deviationPercent: budget > 0 ? percentChange(budget, summary.expensesNet) : null,
      transactionIds: summary.transactionIds,
    });
  }
  return out;
}

export interface ForecastItem {
  date: DateKey;
  label: string;
  /** + in, − out of the accounts in scope. */
  amount: Cents;
  source: 'scheduled' | 'recurrence';
  transactionId?: string;
  recurrenceId?: string;
}

export interface CashflowForecast {
  referenceDate: DateKey;
  horizon: DateKey;
  accountIds: string[];
  startBalance: Cents;
  /** Confirmed items only: scheduled transactions and expected bills not yet paid. */
  items: ForecastItem[];
  endBalance: Cents;
  /** Expected incomes that are not confirmed: shown, never added (semantics 5). */
  unconfirmedIncomes: ForecastItem[];
}

/**
 * Balance of the accounts in scope at the end of the horizon, counting only
 * what is confirmed: transactions already scheduled after the reference date
 * and expected bills not yet settled. Expected incomes are listed apart.
 * Nothing already settled is counted again, and nothing is extrapolated.
 */
export function cashflowForecast(input: {
  accounts: Account[];
  balances: Map<string, Cents>;
  rows: Transaction[];
  recurrences: Recurrence[];
  scope: Set<string>;
  referenceDate: DateKey;
  horizon: DateKey;
}): CashflowForecast {
  const { referenceDate, horizon, scope } = input;
  const rows = live(input.rows);
  const startBalance = [...scope].reduce((s, id) => s + (input.balances.get(id) ?? 0), 0);
  const items: ForecastItem[] = [];
  for (const t of rows) {
    if (t.date <= referenceDate || t.date > horizon || !scope.has(t.accountId)) continue;
    const sign = t.type === 'income' || t.type === 'transfer_in' ? 1 : -1;
    items.push({ date: t.date, label: t.description, amount: sign * t.amount, source: 'scheduled', transactionId: t.id });
  }
  // Expected bills of the month not settled yet (a matching transaction, even a scheduled one, settles them).
  const monthStart = `${referenceDate.slice(0, 7)}-01`;
  const occurrences = allOccurrences(input.recurrences.filter((r) => !r.deletedAt && scope.has(r.accountId)), monthStart, horizon);
  const matched = reconcile(occurrences, rows);
  const unconfirmedIncomes: ForecastItem[] = [];
  for (const o of occurrences) {
    if (matched.has(o) || o.date <= referenceDate) continue;
    const item: ForecastItem = {
      date: o.date,
      label: o.recurrence.description,
      amount: o.recurrence.kind === 'income' ? o.recurrence.amount : -o.recurrence.amount,
      source: 'recurrence',
      recurrenceId: o.recurrence.id,
    };
    if (o.recurrence.kind === 'income') unconfirmedIncomes.push(item);
    else items.push(item);
  }
  items.sort((a, b) => a.date.localeCompare(b.date));
  return {
    referenceDate,
    horizon,
    accountIds: [...scope],
    startBalance,
    items,
    endBalance: startBalance + items.reduce((s, i) => s + i.amount, 0),
    unconfirmedIncomes,
  };
}

export interface PurchaseSimulation {
  amount: Cents;
  date: DateKey;
  forecastBefore: Cents;
  forecastAfter: Cents;
  floor: Cents;
  /** How much the forecast stays above the floor before the purchase (negative: already below). */
  availableAboveFloor: Cents;
  /** How far below the floor the purchase would take the forecast (0 when it fits). */
  shortfall: Cents;
  fits: boolean;
}

/** A hypothetical purchase against the confirmed forecast and the floor the person chose. Nothing is recorded. */
export function simulatePurchase(forecast: CashflowForecast, amount: Cents, date: DateKey, floor: Cents): PurchaseSimulation {
  // A purchase after the horizon doesn't change the forecast of the horizon.
  const after = forecast.endBalance - (date <= forecast.horizon ? amount : 0);
  return {
    amount,
    date,
    forecastBefore: forecast.endBalance,
    forecastAfter: after,
    floor,
    availableAboveFloor: forecast.endBalance - floor,
    shortfall: Math.max(0, floor - after),
    fits: after >= floor,
  };
}

/** Splits `total` into `count` parts that differ by one cent at most, the extra cents first. The sum is exact. */
export function splitEvenly(total: Cents, count: number): Cents[] {
  if (!Number.isSafeInteger(total) || total < 0) throw new RangeError('total must be a non-negative integer of cents');
  if (!Number.isInteger(count) || count < 1) throw new RangeError('count must be a positive integer');
  const base = Math.floor(total / count);
  const remainder = total - base * count;
  return Array.from({ length: count }, (_, i) => base + (i < remainder ? 1 : 0));
}

export interface GoalPlan {
  goalId: string;
  target: Cents;
  reserved: Cents;
  remaining: Cents;
  /** Planned dates after the reference date, with the amount for each; the sum equals `remaining`. */
  contributions: { date: DateKey; amount: Cents }[];
  status: 'done' | 'planned' | 'no_schedule';
}

/** What is missing for a goal and how it splits over the planned dates. No yield is assumed. */
export function goalPlan(goal: Goal, reserves: Reserve[], referenceDate: DateKey): GoalPlan {
  const reserved = reserves.filter((r) => !r.deletedAt && r.goalId === goal.id).reduce((s, r) => s + r.amount, 0);
  const remaining = Math.max(0, goal.targetAmount - reserved);
  const dates = goal.contributionDates.filter((d) => d > referenceDate);
  if (remaining === 0) return { goalId: goal.id, target: goal.targetAmount, reserved, remaining, contributions: [], status: 'done' };
  if (dates.length === 0) return { goalId: goal.id, target: goal.targetAmount, reserved, remaining, contributions: [], status: 'no_schedule' };
  const parts = splitEvenly(remaining, dates.length);
  return {
    goalId: goal.id,
    target: goal.targetAmount,
    reserved,
    remaining,
    contributions: dates.map((date, i) => ({ date, amount: parts[i] })),
    status: 'planned',
  };
}

/**
 * Future value of `principal` at a rate per period given as a decimal string
 * ("0.01" = 1%), compounded `periods` times, no contributions, taxes or fees.
 * Exact rational arithmetic; the result is rounded half up to the cent once.
 */
export function compoundFutureValue(principal: Cents, ratePerPeriod: string, periods: number): Cents {
  const match = /^(\d+)(?:\.(\d{1,12}))?$/.exec(ratePerPeriod.trim());
  if (!match) throw new RangeError('rate must be a non-negative decimal such as "0.01"');
  if (!Number.isInteger(periods) || periods < 0 || periods > 1200) throw new RangeError('periods must be an integer between 0 and 1200');
  const decimals = match[2] ?? '';
  const scale = 10n ** BigInt(decimals.length);
  const rate = BigInt(match[1]) * scale + BigInt(decimals || '0');
  let numerator = BigInt(principal);
  let denominator = 1n;
  for (let i = 0; i < periods; i++) {
    numerator *= scale + rate;
    denominator *= scale;
  }
  return Number((numerator * 2n + denominator) / (denominator * 2n));
}

/** Adds amounts only when they share a currency; otherwise returns the totals per currency. */
export function sumByCurrency(items: { amount: Cents; currency: CurrencyCode }[]): { directSumAllowed: boolean; totals: Map<CurrencyCode, Cents> } {
  const totals = new Map<CurrencyCode, Cents>();
  for (const i of items) totals.set(i.currency, (totals.get(i.currency) ?? 0) + i.amount);
  return { directSumAllowed: totals.size <= 1, totals };
}

/** The civil date of an instant in the app's time zone (never a UTC cut). */
export function civilDate(instant: Date, timeZone: string = DEFAULT_TIME_ZONE): DateKey {
  return todayKey(instant, timeZone);
}

/** Net spending of a period, as in the Resumo (consumption view). */
export function netSpending(rows: Transaction[], from: DateKey, to: DateKey): Cents {
  return summarizePeriod(live(rows).filter((t) => inRange(t, from, to))).expenses;
}
