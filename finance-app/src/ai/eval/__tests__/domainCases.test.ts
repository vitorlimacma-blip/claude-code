// Domain cases of the AI contract (annex D), run without any model against the
// synthetic scenario (annex B) and checked against the independent oracle
// (annex C). Test names start with the case id; `npm run ai:eval` turns the
// results into docs/ai/evaluation-report.json. A name ending in "(parcial)"
// is evidence for part of a case only and never counts as the case passing.
import { prepareDatabase, DEFAULT_ACCOUNT_ID } from '../../../data/setup';
import { civilDate, compoundFutureValue, percentChange, sumByCurrency } from '../../../domain/financeQueries';
import { createTestContext } from '../../../test-utils/testDb';
import { createFinanceTools, invokeFinanceTool, LOCAL_USER_SCOPE, type FinanceResult, type FinanceSession } from '../../finance/tools';
import cases from '../cases/D_cases_E01_E40.json';
import oracle from '../fixtures/C_oracle.json';
import { loadScenario, SCENARIO, SCENARIO_NOW, type IdMap } from '../scenario';

/** Results in tests are read loosely; the shapes are checked by the assertions. */
const invoke = (...args: Parameters<typeof invokeFinanceTool>) => invokeFinanceTool(...args) as Promise<FinanceResult<any>>;

const expected = (id: string) => cases.find((c) => c.id === id)!.expected_facts as Record<string, unknown>;

async function scenario() {
  const repos = await prepareDatabase(createTestContext());
  const ids = await loadScenario(repos);
  const session: FinanceSession = { userScope: LOCAL_USER_SCOPE, repos, now: SCENARIO_NOW };
  const tools = createFinanceTools();
  const call = async (name: string, args: unknown): Promise<FinanceResult<any>> =>
    invoke(tools, { name, arguments: args }, session, { repairsUsed: 0 });
  return { repos, ids, call, session, tools };
}

const mapped = (ids: IdMap, fixtureIds: string[]) => fixtureIds.map((id) => ids.get(id)!).sort();

describe('AI contract — domain cases on the synthetic scenario', () => {
  let s: Awaited<ReturnType<typeof scenario>>;
  beforeAll(async () => {
    s = await scenario();
  });

  it('E01 DESVIO_TRANSPORTE', async () => {
    const r = await s.call('get_budget_deviations', { from: '2026-10-01', to: '2026-10-21', category: 'Transporte' });
    expect(r.status).toBe('ok');
    const [d] = r.data;
    expect({ actual_cents: d.actual, budget_cents: d.budget, deviation_cents: d.deviation }).toEqual(expected('E01'));
    expect(d.actual).toBe(oracle.transport_actual_cents);
    expect([...d.transactionIds].sort()).toEqual(mapped(s.ids, cases[0].transaction_ids!));
    expect(r.period).toEqual({ from: '2026-10-01', to: '2026-10-21' });
  });

  it('E02 RESULTADO_MENSAL', async () => {
    const r = await s.call('get_spending_summary', { from: '2026-10-01', to: '2026-10-21', regime: 'consumption', category: '' });
    expect({ income_cents: r.data.income, expenses_net_cents: r.data.expensesNet, result_cents: r.data.result }).toEqual(expected('E02'));
    expect(r.data.expensesGross).toBe(oracle.october_expenses_gross_cents);
    expect(r.data.refunds).toBe(oracle.october_refunds_cents);
    expect(r.completeness).toBe('complete');
  });

  it('E03 SALDO_CONTA', async () => {
    const r = await s.call('get_account_balances', { reference_date: '', account: 'corrente' });
    expect(r.referenceDate).toBe('2026-10-21');
    expect(r.data.accounts[0].balance).toBe(expected('E03').checking_balance_cents);
  });

  it('E04 TRANSFERENCIA_NEUTRA', async () => {
    const summary = await s.call('get_spending_summary', { from: '2026-10-01', to: '2026-10-21', regime: 'consumption', category: '' });
    const legs = [s.ids.get('oct_transfer_out')!, s.ids.get('oct_transfer_in')!];
    expect(summary.transactionIds.filter((id: string) => legs.includes(id))).toEqual([]);
    expect(summary.data.expensesNet).toBe(oracle.october_expenses_net_cents);
    const legRows = await Promise.all(legs.map((id) => s.repos.transactions.get(id)));
    const consolidated = legRows.reduce((sum, t) => sum + (t!.type === 'transfer_in' ? t!.amount : -t!.amount), 0);
    expect({ consolidated_expense_effect_cents: consolidated, transfer_cents: legRows[0]!.amount }).toEqual(expected('E04'));
    expect(oracle.internal_transfers_consolidated_effect_cents).toBe(0);
  });

  it('E05 ESTORNO_VINCULADO', async () => {
    const r = await s.call('get_spending_summary', { from: '2026-10-01', to: '2026-10-21', regime: 'consumption', category: 'Lazer' });
    expect({ gross_cents: r.data.expensesGross, refund_cents: r.data.refunds, net_cents: r.data.expensesNet }).toEqual(expected('E05'));
    // The refund never becomes income.
    const all = await s.call('get_spending_summary', { from: '2026-10-01', to: '2026-10-21', regime: 'consumption', category: '' });
    expect(all.data.income).toBe(oracle.october_income_cents);
  });

  it('E06 SALDO_CONSOLIDADO', async () => {
    const r = await s.call('get_account_balances', { reference_date: '2026-10-21', account: '' });
    const brl = r.data.totals.find((t: { currency: string }) => t.currency === 'BRL');
    expect({ balance_cents: brl.balance }).toEqual(expected('E06'));
    expect(brl.balance).toBe(oracle.consolidated_balance_as_of_cents);
    // Not automatically free: emergency and trip reserves are set aside.
    expect(brl.free).toBe(brl.balance - 300000 - 130000);
    expect(r.data.accounts.find((a: { accountId: string }) => a.accountId === 'savings').balance).toBe(oracle.savings_balance_as_of_cents);
  });

  it('E07 PROJECAO_CONFIRMADA', async () => {
    const r = await s.call('get_cashflow_forecast', { horizon_end: '2026-10-31' });
    const future = -r.data.items.reduce((sum: number, i: { amount: number }) => sum + i.amount, 0);
    expect({ future_expenses_cents: future, forecast_cents: r.data.endBalance }).toEqual(expected('E07'));
    // Day-to-day accounts only: the savings account (reserves) stays out.
    expect(r.data.accountIds).toContain('checking');
    expect(r.data.accountIds).not.toContain('savings');
    expect(r.assumptions.join(' ')).toMatch(/confirmados/);
  });

  it('E08 COMPRA_PISO', async () => {
    const r = await s.call('simulate_purchase', { amount_cents: oracle.purchase_simulation_cents, date: '' });
    expect({ forecast_after_purchase_cents: r.data.forecastAfter, minimum_cents: r.data.floor, shortfall_cents: r.data.shortfall }).toEqual(expected('E08'));
    expect(r.data.fits).toBe(false);
  });

  it('E09 FOLGA_OPERACIONAL', async () => {
    const r = await s.call('simulate_purchase', { amount_cents: 1, date: '' });
    expect({ available_cents: r.data.availableAboveFloor }).toEqual(expected('E09'));
    expect(r.data.availableAboveFloor).toBe(oracle.available_above_operating_floor_cents);
  });

  it('E10 META_APORTES', async () => {
    const r = await s.call('get_goal_plan', { goal: 'viagem' });
    const [plan] = r.data;
    expect({ remaining_cents: plan.remaining, contributions_cents: plan.contributions.map((c: { amount: number }) => c.amount) }).toEqual(expected('E10'));
    expect(plan.contributions.reduce((sum: number, c: { amount: number }) => sum + c.amount, 0)).toBe(oracle.goal_remaining_cents);
  });

  it('E11 CAUSA_DIFERENCA', async () => {
    const sum = (from: string, to: string, category: string) =>
      s.call('get_spending_summary', { from, to, regime: 'consumption', category }).then((r) => r.data.expensesNet as number);
    const total = (await sum('2026-10-01', '2026-10-21', '')) - (await sum('2026-09-01', '2026-09-30', ''));
    const transport = (await sum('2026-10-01', '2026-10-21', 'Transporte')) - (await sum('2026-09-01', '2026-09-30', 'Transporte'));
    const leisure = (await sum('2026-10-01', '2026-10-21', 'Lazer')) - (await sum('2026-09-01', '2026-09-30', 'Lazer'));
    expect({ total_increase_cents: total, transport_increase_cents: transport, leisure_increase_cents: leisure }).toEqual(expected('E11'));
    expect(percentChange(oracle.september_expenses_cents, oracle.october_expenses_net_cents)).toBe(oracle.expense_increase_percent_rounded_2);
  });

  it('E15 DADO_AUSENTE', async () => {
    const r = await s.call('get_spending_summary', { from: '2026-08-01', to: '2026-08-31', regime: 'consumption', category: '' });
    expect(r.status).toBe(expected('E15').status);
    expect(r.data).toBeNull();
    expect(r.missingData.join(' ')).toMatch(/não significa gasto zero/);
  });

  it('E21 ISOLAMENTO_USUARIO (parcial): um user_id vindo do modelo não é aceito', async () => {
    const state = { repairsUsed: 0 };
    const r = await invoke(s.tools, { name: 'get_account_balances', arguments: { reference_date: '', account: '', user_id: 'demo_B' } }, s.session, state);
    expect(r.status).toBe('invalid_arguments');
    expect(r.data).toBeNull();
    expect(r.userScope).toBe(LOCAL_USER_SCOPE);
  });

  it('E31 ARGUMENTOS_INVALIDOS', async () => {
    const state = { repairsUsed: 0 };
    const run = (args: unknown, name = 'get_spending_summary') => invoke(s.tools, { name, arguments: args }, s.session, state);
    const extra = await run({ from: '2026-10-01', to: '2026-10-21', regime: 'consumption', category: '', sql: 'SELECT * FROM transactions' });
    expect(extra.status).toBe('invalid_arguments');
    expect(extra.errors).toContain('Campo não permitido: sql.');
    // One controlled repair only: the next invalid call fails for good.
    const badDate = await run({ from: '2026-02-30', to: '2026-10-21', regime: 'consumption', category: '' });
    expect(badDate.status).toBe('failed');
    const unknownTool = await run({}, 'run_sql');
    expect(unknownTool.status).toBe('failed');
    expect([extra, badDate, unknownTool].every((r) => r.data === null && r.transactionIds.length === 0)).toBe(true);
    expect(expected('E31')).toEqual({ executed_invalid_calls: 0 });
  });

  it('E32 DUPLICIDADE_IMPORTACAO', async () => {
    const before = (await s.repos.transactions.list()).length;
    const again = await s.repos.transactions.createImported({ origin: 'synthetic_fixture_v1', externalId: 'oct_rent', accountId: 'checking', type: 'expense', amount: 150000, date: '2026-10-06' });
    expect(again.id).toBe(s.ids.get('oct_rent'));
    expect({ created_duplicates: (await s.repos.transactions.list()).length - before }).toEqual(expected('E32'));
  });

  it('E33 DUPLA_COMPRA_LEGITIMA', async () => {
    const repos = await prepareDatabase(createTestContext());
    const purchase = { origin: 'bank', accountId: DEFAULT_ACCOUNT_ID, type: 'expense' as const, amount: 2500, date: '2026-10-10', description: 'Padaria' };
    await repos.transactions.createImported({ ...purchase, externalId: 'a1' });
    await repos.transactions.createImported({ ...purchase, externalId: 'a2' });
    const rows = await repos.transactions.list();
    expect({ deleted_records: 2 - rows.length }).toEqual(expected('E33'));
  });

  it('E38 MOEDAS_DISTINTAS', async () => {
    const r = sumByCurrency([
      { amount: 10000, currency: 'BRL' },
      { amount: 10000, currency: 'USD' },
    ]);
    expect({ direct_sum_allowed: r.directSumAllowed }).toEqual(expected('E38'));
    const repos = await prepareDatabase(createTestContext());
    await repos.accounts.create({ id: 'usd', name: 'Conta em dólar', type: 'checking', currency: 'USD', initialBalance: 10000 });
    await repos.accounts.update(DEFAULT_ACCOUNT_ID, { initialBalance: 10000 });
    const session: FinanceSession = { userScope: LOCAL_USER_SCOPE, repos, now: SCENARIO_NOW };
    const balances = await invoke(createFinanceTools(), { name: 'get_account_balances', arguments: { reference_date: '', account: '' } }, session, { repairsUsed: 0 });
    expect(balances.data.totals.map((t: { currency: string; balance: number }) => [t.currency, t.balance]).sort()).toEqual([['BRL', 10000], ['USD', 10000]]);
    expect(balances.missingData.join(' ')).toMatch(/moedas diferentes/);
  });

  it('E39 FRONTEIRA_DATA', () => {
    // 23:30 in São Paulo on the 21st is already the 22nd in UTC.
    expect(civilDate(new Date('2026-10-22T02:30:00Z'))).toBe('2026-10-21');
    expect(civilDate(new Date('2026-10-21T03:00:00Z'))).toBe('2026-10-21');
    expect(civilDate(new Date('2026-10-21T02:59:59Z'))).toBe('2026-10-20');
    expect(expected('E39')).toEqual({ uses_timezone: 'America/Sao_Paulo' });
  });

  it('oracle: projected October expenses and the floor margin', async () => {
    const spent = await s.call('get_spending_summary', { from: '2026-10-01', to: '2026-10-21', regime: 'consumption', category: '' });
    const forecast = await s.call('get_cashflow_forecast', { horizon_end: '2026-10-31' });
    const future = -forecast.data.items.reduce((sum: number, i: { amount: number }) => sum + i.amount, 0);
    expect(future).toBe(oracle.confirmed_future_expenses_cents);
    expect(forecast.data.endBalance).toBe(oracle.checking_forecast_end_cents);
    expect(spent.data.expensesNet + future).toBe(oracle.projected_october_expenses_cents);
    expect(SCENARIO.monthly_budget_cents - (spent.data.expensesNet + future)).toBe(oracle.remaining_global_budget_after_forecast_cents);
  });
});

describe('AI contract — isolated scenarios', () => {
  const iso = SCENARIO.isolated_scenarios;

  it('E12 FATURA_SEM_DUPLICACAO', async () => {
    const repos = await prepareDatabase(createTestContext());
    await repos.accounts.create({ id: 'card', name: 'Cartão fictício', type: 'credit_card', closingDay: 3, dueDay: 10 });
    await repos.transactions.create({ accountId: 'card', type: 'expense', amount: iso.card.purchase_cents, date: '2026-10-02', categoryId: 'sys-compras' });
    await repos.transactions.createTransfer({ fromAccountId: DEFAULT_ACCOUNT_ID, toAccountId: 'card', amount: iso.card.invoice_payment_cents, date: '2026-10-10' });
    const session: FinanceSession = { userScope: LOCAL_USER_SCOPE, repos, now: SCENARIO_NOW };
    const run = (regime: string) =>
      invoke(createFinanceTools(), { name: 'get_spending_summary', arguments: { from: '2026-10-01', to: '2026-10-31', regime, category: '' } }, session, { repairsUsed: 0 });
    const consumption = await run('consumption');
    const cash = await run('cash');
    expect({ consumption_cents: consumption.data.expensesNet, bank_cash_outflow_cents: cash.data.expensesNet }).toEqual(expected('E12'));
  });

  it('E13 PARCELA_COMPETENCIA', async () => {
    const repos = await prepareDatabase(createTestContext());
    await repos.accounts.create({ id: 'card', name: 'Cartão fictício', type: 'credit_card', closingDay: 3, dueDay: 10 });
    await repos.transactions.createInstallments({ accountId: 'card', total: iso.installment.total_cents, count: iso.installment.number_of_installments, firstDate: iso.installment.first_due_date, categoryId: 'sys-compras' });
    const session: FinanceSession = { userScope: LOCAL_USER_SCOPE, repos, now: SCENARIO_NOW };
    const run = (from: string, to: string) =>
      invoke(createFinanceTools(), { name: 'get_spending_summary', arguments: { from, to, regime: 'consumption', category: '' } }, session, { repairsUsed: 0 });
    const october = await run('2026-10-01', '2026-10-31');
    const future = await run('2026-11-01', '2027-12-31');
    expect({ october_installment_cents: october.data.expensesNet, future_commitments_cents: future.data.expensesNet }).toEqual(expected('E13'));
  });

  it('E14 JUROS_FICTICIOS', () => {
    const fv = compoundFutureValue(iso.interest.principal_cents, iso.interest.monthly_rate_decimal, iso.interest.periods);
    expect({ future_value_cents: fv }).toEqual(expected('E14'));
  });

  it('E18 BASE_ZERO_PERCENTUAL', () => {
    expect({ absolute_increase_cents: 10000 - 0, percentage: percentChange(0, 10000) }).toEqual(expected('E18'));
  });
});
