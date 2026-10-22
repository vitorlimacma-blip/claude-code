import type { AccountType, Cents } from '../domain/types';
import type { Repositories } from './repositories';
import { DEFAULT_ACCOUNT_ID } from './setup';

// First run (briefing §13): short and skippable. Someone who already has data
// (an update from an earlier version, a restored backup) never sees it.

export const ONBOARDING_KEY = 'onboarding.status';

export interface OnboardingStatus {
  /** How it ended: finished, skipped, or not needed because data already existed. */
  outcome: 'completed' | 'skipped' | 'existing_data';
  at: string;
}

export async function onboardingNeeded(repos: Repositories, now: Date = new Date()): Promise<boolean> {
  if (await repos.settings.get<OnboardingStatus | null>(ONBOARDING_KEY, null)) return false;
  const hasTransactions = (await repos.transactions.list({ limit: 1 })).length > 0;
  const hasOwnAccounts = (await repos.accounts.list({ includeArchived: true })).some((a) => a.id !== DEFAULT_ACCOUNT_ID);
  if (hasTransactions || hasOwnAccounts) {
    await finishOnboarding(repos, 'existing_data', now);
    return false;
  }
  return true;
}

export async function finishOnboarding(repos: Repositories, outcome: OnboardingStatus['outcome'], now: Date = new Date()): Promise<void> {
  await repos.settings.set(ONBOARDING_KEY, { outcome, at: now.toISOString() } satisfies OnboardingStatus);
}

/**
 * The first account: cash goes into the default wallet (no second wallet);
 * a bank account is created. Returns the account id.
 */
export async function createFirstAccount(repos: Repositories, input: { name: string; type: Extract<AccountType, 'checking' | 'savings' | 'wallet'>; balance: Cents }): Promise<string> {
  const name = input.name.trim();
  if (input.type === 'wallet') {
    const wallet = await repos.accounts.get(DEFAULT_ACCOUNT_ID);
    if (wallet && !wallet.archived) {
      await repos.accounts.update(DEFAULT_ACCOUNT_ID, { initialBalance: input.balance, ...(name && { name }) });
      return DEFAULT_ACCOUNT_ID;
    }
  }
  const created = await repos.accounts.create({ name: name || 'Conta corrente', type: input.type, initialBalance: input.balance });
  return created.id;
}
