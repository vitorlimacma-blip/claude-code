import type { SnapshotStore } from '../backup';
import type { RepositoryContext } from '../context';
import { createAccountsRepository } from './accounts';
import { createBackupRepository } from './backup';
import { createBudgetsRepository } from './budgets';
import { createCategoriesRepository } from './categories';
import { createDemoRepository } from './demo';
import { createRecurrencesRepository } from './recurrences';
import { createSettingsRepository } from './settings';
import { createTransactionsRepository } from './transactions';

/**
 * The app's only entry point to persisted data. Screens and features talk to
 * these repositories, never to SQL, so the storage (local SQLite today, a
 * synced or server-backed store later) can change behind them.
 */
export function createRepositories(ctx: RepositoryContext, options: { backups?: SnapshotStore } = {}) {
  return {
    accounts: createAccountsRepository(ctx),
    categories: createCategoriesRepository(ctx),
    budgets: createBudgetsRepository(ctx),
    transactions: createTransactionsRepository(ctx),
    /** Expected bills and incomes, used by projections. */
    recurrences: createRecurrencesRepository(ctx),
    settings: createSettingsRepository(ctx),
    /** Export/import and automatic backups (kept in a separate database). */
    backup: createBackupRepository(ctx, options.backups),
    /** Fictitious data for testing the app (Ajustes › Dados de teste). */
    demo: createDemoRepository(ctx),
    /** Subscribe to data changes (used by the `useQuery` hook to refresh screens). */
    subscribe: ctx.bus.subscribe,
  };
}

export type Repositories = ReturnType<typeof createRepositories>;

export type { NewAccountInput, AccountPatch } from './accounts';
export type { NewCategoryInput, CategoryPatch } from './categories';
export type { NewRecurrenceInput, RecurrencePatch } from './recurrences';
export type {
  NewInstallmentsInput,
  NewRefundInput,
  NewTransactionInput,
  NewTransferInput,
  TransactionFilter,
  TransactionPatch,
} from './transactions';
