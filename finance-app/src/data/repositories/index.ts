import type { RepositoryContext } from '../context';
import { createAccountsRepository } from './accounts';
import { createBudgetsRepository } from './budgets';
import { createCategoriesRepository } from './categories';
import { createSettingsRepository } from './settings';
import { createTransactionsRepository } from './transactions';

/**
 * The app's only entry point to persisted data. Screens and features talk to
 * these repositories, never to SQL, so the storage (local SQLite today, a
 * synced or server-backed store later) can change behind them.
 */
export function createRepositories(ctx: RepositoryContext) {
  return {
    accounts: createAccountsRepository(ctx),
    categories: createCategoriesRepository(ctx),
    budgets: createBudgetsRepository(ctx),
    transactions: createTransactionsRepository(ctx),
    settings: createSettingsRepository(ctx),
    /** Subscribe to data changes (used by the `useQuery` hook to refresh screens). */
    subscribe: ctx.bus.subscribe,
  };
}

export type Repositories = ReturnType<typeof createRepositories>;

export type { NewAccountInput, AccountPatch } from './accounts';
export type { NewCategoryInput, CategoryPatch } from './categories';
export type { NewTransactionInput, NewTransferInput, TransactionFilter, TransactionPatch } from './transactions';
