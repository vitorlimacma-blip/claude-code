import { budgetStatuses, categoryProjections } from './budgets';
import { buildInsights, compareEquivalentPeriods } from './insights';
import { openInvoices, summarizeBalances, summarizePeriod } from './ledger';
import { availableBalanceHistory, projectCash } from './projection';
import type { Account, Category, Cents, DateKey, Recurrence, Transaction } from './types';

/** What the shared financial picture is computed from (loaded by `loadPictureData`). */
export interface PictureData {
  accounts: Account[];
  balances: Map<string, Cents>;
  /** The current month plus a few complete months, and future-dated rows. */
  transactions: Transaction[];
  recurrences: Recurrence[];
  categories: Category[];
  /** Budget per category for the current month. */
  budgets: Map<string, Cents>;
  /** Every row of every credit card (invoices need the full history). */
  cardRows: Transaction[];
}

/**
 * Everything the Resumo, Previsões and the assistant show, computed once with
 * the same rules (briefing §9: don't mix policies between screens).
 */
export function computeFinancialPicture(data: PictureData, today: DateKey) {
  const month = today.slice(0, 7);
  const { accounts, balances, transactions, recurrences, categories, budgets, cardRows } = data;
  const cardIds = new Set(accounts.filter((a) => a.type === 'credit_card').map((a) => a.id));
  // Recent rows, with full history for the cards (for their invoices).
  const rows = [...transactions.filter((t) => !cardIds.has(t.accountId)), ...cardRows];
  const projection = projectCash({ today, accounts, balances, transactions: rows, recurrences });
  const budgetList = budgetStatuses({ categories, budgets, transactions: rows, recurrences, today });
  const categoryMonth = categoryProjections({ categories, transactions: rows, recurrences, today });
  const comparison = compareEquivalentPeriods(rows, categories, today);
  const monthRows = rows.filter((t) => t.date >= `${month}-01` && t.date <= today);
  const insights = buildInsights({ today, projection, budgets: budgetList, comparison, categories, monthTransactions: monthRows });
  const realized = availableBalanceHistory(accounts, balances, rows, `${month}-01`, today);
  const invoices = accounts.flatMap((a) => openInvoices(a, cardRows) ?? []);
  const lastDate = rows
    .filter((t) => t.date <= today && !t.deletedAt)
    .reduce<string | null>((max, t) => (max === null || t.date > max ? t.date : max), null);
  return {
    today,
    month,
    accounts,
    balances,
    categories,
    recurrences,
    /** Every row the picture used (recent rows plus all card rows). */
    rows,
    projection,
    budgets: budgetList,
    categoryMonth,
    comparison,
    insights,
    realized,
    invoices,
    monthTotals: summarizePeriod(monthRows),
    balanceSummary: summarizeBalances(accounts, balances),
    lastTransactionDate: lastDate,
  };
}

export type FinancialPicture = ReturnType<typeof computeFinancialPicture>;
