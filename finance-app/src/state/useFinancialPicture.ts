import { useMemo } from 'react';
import { budgetStatuses, categoryProjections } from '../domain/budgets';
import { addDaysToDateKey, addMonths } from '../domain/dates';
import { buildInsights, compareEquivalentPeriods } from '../domain/insights';
import { openInvoices, summarizeBalances, summarizePeriod } from '../domain/ledger';
import { availableBalanceHistory, projectCash } from '../domain/projection';
import { useQuery } from './useQuery';
import { useToday } from './useToday';

/** History the projections look at: the current month plus four complete months. */
const HISTORY_MONTHS = 4;
/** Future-dated rows (installments, scheduled bills) considered. */
const FUTURE_DAYS = 60;

/**
 * Everything the Resumo and Previsões show, computed once with the same rules
 * (briefing §9: don't mix policies between screens).
 */
export function useFinancialPicture() {
  const today = useToday();
  const month = today.slice(0, 7);
  const { data } = useQuery(
    async (r) => {
      const [accounts, balances, transactions, recurrences, categories, budgets] = await Promise.all([
        r.accounts.list(),
        r.accounts.balances(today),
        r.transactions.list({ from: `${addMonths(month, -HISTORY_MONTHS)}-01`, to: addDaysToDateKey(today, FUTURE_DAYS) }),
        r.recurrences.list(),
        r.categories.list(),
        r.budgets.amountsForMonth(month),
      ]);
      // Invoices need every card row, not only recent ones.
      const cardRows = (
        await Promise.all(accounts.filter((a) => a.type === 'credit_card').map((a) => r.transactions.list({ accountId: a.id })))
      ).flat();
      return { accounts, balances, transactions, recurrences, categories, budgets, cardRows };
    },
    ['accounts', 'transactions', 'recurrences', 'categories', 'budgets'],
    [today, month]
  );

  return useMemo(() => {
    if (!data) return null;
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
    const lastDate = rows.filter((t) => t.date <= today && !t.deletedAt).reduce<string | null>((max, t) => (max === null || t.date > max ? t.date : max), null);
    return {
      today,
      month,
      accounts,
      balances,
      categories,
      recurrences,
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
  }, [data, today, month]);
}

export type FinancialPicture = NonNullable<ReturnType<typeof useFinancialPicture>>;
