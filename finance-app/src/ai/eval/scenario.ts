// TEST-ONLY. Loads the synthetic scenario of the AI contract (annex B) into a
// disposable test database through the app's own repositories, so the
// deterministic tools can be checked against the independent oracle (annex
// C). Never imported by the app: see `src/ai/eval/README.md`.
import type { Repositories } from '../../data/repositories';
import { FINANCE_SETTINGS } from '../finance/tools';
import scenarioJson from './fixtures/B_scenario.json';

export const SCENARIO = scenarioJson;
export const ORIGIN = 'synthetic_fixture_v1';
/** "as_of": 2026-10-21T12:00:00-03:00. */
export const SCENARIO_NOW = () => new Date('2026-10-21T12:00:00-03:00');

/** Fixture category → the app's default categories. */
export const CATEGORY_MAP: Record<string, string> = {
  salary: 'sys-receita-salario',
  housing: 'sys-moradia-aluguel',
  utilities: 'sys-moradia-energia',
  groceries: 'sys-alimentacao-mercado',
  transport: 'sys-transporte-apps',
  leisure: 'sys-lazer',
  health: 'sys-saude',
  subscriptions: 'sys-assinaturas',
};
/** Fixture budget keys are top-level categories. */
const BUDGET_MAP: Record<string, string> = { transport: 'sys-transporte' };

type FixtureTx = (typeof scenarioJson.transactions)[number] & {
  reversal_of?: string;
  direction?: string;
  transfer_group_id?: string;
  counterparty_account_id?: string;
};

/**
 * The fixture gives each account a balance on its opening date; the app keeps
 * the balance before the first recorded transaction. Convert: subtract what
 * moved in that account before the opening date (D-069).
 */
function initialBalance(accountId: string, openingDate: string, opening: number): number {
  let before = 0;
  for (const t of scenarioJson.transactions as FixtureTx[]) {
    if (t.account_id !== accountId || t.date >= openingDate) continue;
    const inflow = t.type === 'income' || t.type === 'refund' || (t.type === 'transfer' && t.direction === 'in');
    before += inflow ? t.amount_cents : -t.amount_cents;
  }
  return opening - before;
}

/** Fixture transaction id → the app's id (transfer legs get the app's own ids). */
export type IdMap = Map<string, string>;

export async function loadScenario(repos: Repositories): Promise<IdMap> {
  const ids: IdMap = new Map();
  for (const a of scenarioJson.accounts) {
    await repos.accounts.create({
      id: a.id,
      name: a.id === 'checking' ? 'Conta corrente fictícia' : 'Poupança fictícia',
      type: a.id === 'checking' ? 'checking' : 'savings',
      initialBalance: initialBalance(a.id, a.opening_date, a.opening_balance_cents),
    });
  }
  const txs = scenarioJson.transactions as FixtureTx[];
  for (const t of txs.filter((x) => x.type === 'income' || x.type === 'expense')) {
    const row = await repos.transactions.createImported({
      origin: ORIGIN,
      externalId: t.external_id,
      accountId: t.account_id,
      type: t.type as 'income' | 'expense',
      amount: t.amount_cents,
      date: t.date,
      categoryId: CATEGORY_MAP[t.category ?? ''] ?? null,
      description: t.description,
    });
    ids.set(t.id, row.id);
  }
  for (const t of txs.filter((x) => x.type === 'refund')) {
    const row = await repos.transactions.createRefund({ id: `refund-${t.id}`, refundOfId: ids.get(t.reversal_of!)!, amount: t.amount_cents, date: t.date, description: t.description });
    ids.set(t.id, row.id);
  }
  const groups = new Map<string, FixtureTx[]>();
  for (const t of txs.filter((x) => x.type === 'transfer')) groups.set(t.transfer_group_id!, [...(groups.get(t.transfer_group_id!) ?? []), t]);
  for (const [group, legs] of groups) {
    const out = legs.find((l) => l.direction === 'out')!;
    const inn = legs.find((l) => l.direction === 'in')!;
    const pair = await repos.transactions.createTransfer({ id: group, fromAccountId: out.account_id, toAccountId: inn.account_id, amount: out.amount_cents, date: out.date, description: out.description });
    ids.set(out.id, pair.out.id);
    ids.set(inn.id, pair.in.id);
  }
  for (const s of scenarioJson.scheduled) {
    const row = await repos.transactions.create({
      id: s.id,
      accountId: s.account_id,
      type: s.type as 'expense',
      amount: s.amount_cents,
      date: s.date,
      categoryId: CATEGORY_MAP[s.category] ?? null,
      description: s.description,
      status: 'pending',
    });
    ids.set(s.id, row.id);
  }
  for (const [key, cents] of Object.entries(scenarioJson.category_budgets_cents)) await repos.budgets.set(BUDGET_MAP[key], cents);
  await repos.settings.set(FINANCE_SETTINGS.operatingFloor, { amount: scenarioJson.minimum_operating_balance_cents });
  for (const g of scenarioJson.goals) {
    await repos.goals.create({ id: g.id, name: 'Viagem', targetAmount: g.target_cents, deadline: g.deadline, contributionDates: g.contribution_dates });
  }
  for (const a of scenarioJson.allocations) {
    if (a.id === 'unassigned') continue; // not set aside: free money
    const isGoal = scenarioJson.goals.some((g) => g.id === a.id);
    await repos.goals.createReserve({
      id: `reserve-${a.id}`,
      accountId: a.account_id,
      purpose: isGoal ? 'goal' : 'emergency',
      goalId: isGoal ? a.id : null,
      name: isGoal ? 'Viagem' : 'Reserva de emergência',
      amount: a.amount_cents,
    });
  }
  return ids;
}
