import { createFirstAccount, finishOnboarding, onboardingNeeded } from '../onboarding';
import { DEFAULT_ACCOUNT_ID, prepareDatabase } from '../setup';
import { createTestContext } from '../../test-utils/testDb';

describe('onboarding', () => {
  it('is shown on a fresh install and not again once finished or skipped', async () => {
    const repos = await prepareDatabase(createTestContext());
    expect(await onboardingNeeded(repos)).toBe(true);
    await finishOnboarding(repos, 'skipped');
    expect(await onboardingNeeded(repos)).toBe(false);
  });

  it('is never shown to someone who already has data', async () => {
    const repos = await prepareDatabase(createTestContext());
    await repos.transactions.create({ accountId: DEFAULT_ACCOUNT_ID, type: 'expense', amount: 1000, date: '2026-10-01', description: 'Café' });
    expect(await onboardingNeeded(repos)).toBe(false);
    // Recorded, so the check doesn't run again.
    expect(await repos.settings.get('onboarding.status', null)).toMatchObject({ outcome: 'existing_data' });
  });

  it('cash goes to the default wallet; a bank account is created', async () => {
    const repos = await prepareDatabase(createTestContext());
    expect(await createFirstAccount(repos, { name: '', type: 'wallet', balance: 5000 })).toBe(DEFAULT_ACCOUNT_ID);
    expect((await repos.accounts.get(DEFAULT_ACCOUNT_ID))?.initialBalance).toBe(5000);
    const id = await createFirstAccount(repos, { name: 'Nubank', type: 'checking', balance: 120000 });
    const account = await repos.accounts.get(id);
    expect(account).toMatchObject({ name: 'Nubank', type: 'checking', initialBalance: 120000 });
    expect((await repos.accounts.list()).length).toBe(2);
  });
});
