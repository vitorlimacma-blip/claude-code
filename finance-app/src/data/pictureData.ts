import { addDaysToDateKey, addMonths } from '../domain/dates';
import type { PictureData } from '../domain/picture';
import type { DateKey } from '../domain/types';
import type { Repositories } from './repositories';

/** History the projections look at: the current month plus four complete months. */
const HISTORY_MONTHS = 4;
/** Future-dated rows (installments, scheduled bills) considered. */
const FUTURE_DAYS = 60;

/** Tables whose changes alter the financial picture. */
export const PICTURE_TABLES = ['accounts', 'transactions', 'recurrences', 'categories', 'budgets'] as const;

/** Loads what `computeFinancialPicture` needs, for the screens and the assistant alike. */
export async function loadPictureData(r: Repositories, today: DateKey): Promise<PictureData> {
  const month = today.slice(0, 7);
  const [accounts, balances, transactions, recurrences, categories, budgets] = await Promise.all([
    r.accounts.list(),
    r.accounts.balances(today),
    r.transactions.list({ from: `${addMonths(month, -HISTORY_MONTHS)}-01`, to: addDaysToDateKey(today, FUTURE_DAYS) }),
    r.recurrences.list(),
    r.categories.list(),
    r.budgets.amountsForMonth(month),
  ]);
  const cardRows = (
    await Promise.all(accounts.filter((a) => a.type === 'credit_card').map((a) => r.transactions.list({ accountId: a.id })))
  ).flat();
  return { accounts, balances, transactions, recurrences, categories, budgets, cardRows };
}
