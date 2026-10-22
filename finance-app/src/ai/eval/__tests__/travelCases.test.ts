// Travel planning cases of the AI contract (annex M), on the independent
// synthetic scenario of M.8 and its oracle. Domain only: no model, no search.
// Names ending in "(parcial)" are evidence for part of a case and never count as a pass.
import { prepareDatabase } from '../../../data/setup';
import { assessGoalFeasibility, personalShare, type FeasibilityInput } from '../../../domain/goalFeasibility';
import { createTestContext } from '../../../test-utils/testDb';
import { answerQuestion } from '../../engine/answer';
import { createContractTools } from '../../finance/contractTools';
import { LOCAL_USER_SCOPE } from '../../finance/tools';
import scenario from '../fixtures/M8_travel_scenario.json';

const f = scenario.fixture;
const x = scenario.expected;

const base = (): FeasibilityInput => ({
  target: f.trip_budget_target_cents,
  budgetKind: 'target_ceiling',
  alreadyPaid: 0,
  reserved: f.authorized_trip_reserve_cents,
  contributionDates: f.contribution_dates,
  payments: [],
  monthlyIncomeConfirmed: f.monthly_income_confirmed_cents,
  monthlyExpenses: f.monthly_expense_components_cents,
  protectionMargin: f.additional_monthly_protection_margin_cents,
  optionalReductions: f.proposed_optional_reductions.map((r) => ({ category: r.category, baseline: r.baseline_cents, reduction: r.reduction_cents })),
});

let fetchCalls = 0;
const realFetch = global.fetch;
beforeEach(() => {
  fetchCalls = 0;
  global.fetch = (async () => {
    fetchCalls++;
    throw new Error('network blocked in this test');
  }) as typeof fetch;
});
afterAll(() => {
  global.fetch = realFetch;
});

describe('AI contract — travel planning (annex M)', () => {
  it('E82 Viagem com teto informado', () => {
    const r = assessGoalFeasibility(base());
    expect({
      trip_funding_gap_cents: r.fundingGap,
      contribution_count: r.requiredContributions.length,
      required_contributions_cents: r.requiredContributions,
      base_monthly_expenses_cents: r.base.monthlyExpenses,
      base_safe_monthly_capacity_cents: r.base.safeMonthlyCapacity,
      monthly_plan_gap_cents: r.base.monthlyGap,
      optional_reduction_cents: r.withReductions!.reduction,
      scenario_monthly_expenses_cents: r.withReductions!.monthlyExpenses,
      scenario_safe_monthly_capacity_cents: r.withReductions!.safeMonthlyCapacity,
      base_end_funding_cents: r.base.endFunding,
      scenario_end_funding_cents: r.withReductions!.endFunding,
    }).toEqual(x);
    expect(r.status).toBe('fits_with_adjustment');
    // R$ 4.000 is the chosen ceiling, not a verified price.
    expect(r.assumptions[0]).toMatch(/teto que você escolheu/);
  });

  it('E83 Cortes dispensáveis', () => {
    // Capacity of R$ 600/month already available: no cuts are suggested.
    const r = assessGoalFeasibility({ ...base(), monthlyExpenses: { fixed_and_essential: 340000, restaurants: 40000, delivery: 40000 } });
    expect(r.base.safeMonthlyCapacity).toBe(60000);
    expect(r.status).toBe('fits');
    expect(r.withReductions).toBeNull();
  });

  it('E84 Receita variável incerta', () => {
    // The conservative case uses confirmed income only; extra income is a separate, labeled scenario.
    const conservative = assessGoalFeasibility(base());
    const withExtra = assessGoalFeasibility({ ...base(), monthlyIncomeConfirmed: f.monthly_income_confirmed_cents + 30000 });
    expect(conservative.base.safeMonthlyCapacity).toBe(x.base_safe_monthly_capacity_cents);
    expect(withExtra.base.safeMonthlyCapacity).toBeGreaterThan(conservative.base.safeMonthlyCapacity);
    expect(conservative.assumptions.join(' ')).toMatch(/renda extra incerta fica fora/);
  });

  it('E85 Saldo reservado', () => {
    // Only the reserve authorized for the trip counts; the R$ 5.000 emergency reserve is never added.
    const r = assessGoalFeasibility(base());
    expect(r.base.endFunding).toBe(x.base_end_funding_cents);
    expect(r.base.endFunding).toBeLessThan(f.emergency_reserve_cents);
    expect(r.assumptions).toContain('A reserva de emergência não é usada.');
  });

  it('E86 Busca de preço sem permissão', async () => {
    const repos = await prepareDatabase(createTestContext());
    const tool = createContractTools().find((t) => t.name === 'estimate_travel_cost')!;
    const r = await tool.run({ destination: 'Salvador', travellers: 2 }, { userScope: LOCAL_USER_SCOPE, repos, now: () => new Date('2026-10-22T12:00:00-03:00') });
    expect(r.status).toBe('insufficient_data');
    expect(r.data).toBeNull();
    expect(fetchCalls).toBe(0);
  });

  it('E87 Custo por pessoa e grupo', () => {
    const s = personalShare({ price: 200000, unit: 'per_person', travellers: 4, payers: 2 });
    expect(s.total).toBe(800000);
    expect(s.share).toBe(400000);
    expect(s.share).not.toBe(200000);
    expect(s.question).toMatch(/quem paga/);
  });

  it('E88 Obrigação antes dos aportes', () => {
    // A R$ 800 ticket due before the first contribution, with nothing set aside: the total fits, the date doesn't.
    const r = assessGoalFeasibility({
      ...base(),
      reserved: 0,
      target: 300000,
      monthlyExpenses: { fixed_and_essential: 340000, restaurants: 40000, delivery: 40000 },
      payments: [{ date: '2026-11-01', amount: 80000, label: 'Passagem' }],
    });
    expect(r.base.endFunding).toBeGreaterThanOrEqual(300000);
    expect(r.base.shortOn).toBe('2026-11-01');
    expect(r.status).toBe('cash_short_on_date');
  });

  it('E89 Sugestão com base real', () => {
    const r = assessGoalFeasibility(base());
    expect(r.withReductions!.reduction).toBe(12000 + 8000);
    // A scenario, never a saving already made.
    expect(r.base.monthlyExpenses).toBe(x.base_monthly_expenses_cents);
  });

  it('E90 Categoria essencial ou ambígua', () => {
    // Transport is recorded but never cut unless the person offers it.
    const r = assessGoalFeasibility({ ...base(), monthlyExpenses: { ...f.monthly_expense_components_cents, transport: 70000 }, optionalReductions: [] });
    expect(r.withReductions).toBeNull();
    expect(r.status).toBe('does_not_fit');
  });

  it('E91 Gasto pago ou cancelamento', () => {
    // After a cancellation the target is R$ 4.000; R$ 500 already paid and R$ 1.000 reserved are discounted once.
    const r = assessGoalFeasibility({ ...base(), alreadyPaid: 50000 });
    expect(r.fundingGap).toBe(400000 - 50000 - 100000);
    expect(r.requiredContributions.reduce((s, c) => s + c, 0)).toBe(r.fundingGap);
  });

  it('E92 Poucas informações e juros', () => {
    // No date yet: no invented schedule and no yield to close the gap.
    const r = assessGoalFeasibility({ ...base(), contributionDates: [] });
    expect(r.status).toBe('missing_data');
    expect(r.requiredContributions).toEqual([]);
    expect(r.assumptions.join(' ')).toMatch(/Sem rendimento/);
  });

  it('E93 Orçamento incompleto e oscilação de preços (parcial): com 3 dias de lançamentos, o gasto típico fica indisponível', async () => {
    const repos = await prepareDatabase(createTestContext());
    for (const d of ['2026-10-20', '2026-10-21', '2026-10-22']) {
      await repos.transactions.create({ accountId: (await repos.accounts.list())[0].id, type: 'expense', amount: 5000, date: d });
    }
    const tool = createContractTools().find((t) => t.name === 'assess_goal_feasibility')!;
    const r = await tool.run(
      { target_cents: 400000, budget_kind: 'informal_estimate', goal: '', departure_date: '2027-04-01', already_paid_cents: 0 },
      { userScope: LOCAL_USER_SCOPE, repos, now: () => new Date('2026-10-22T12:00:00-03:00') }
    );
    expect(r.completeness).toBe('partial');
    expect(r.missingData.join(' ')).toMatch(/mês completo/);
  });

  it('a trip question with an amount and a month is a plan, not a purchase today', async () => {
    const repos = await prepareDatabase(createTestContext());
    await repos.demo.generate('2026-10-22');
    const a = await answerQuestion({
      question: 'Cabe uma viagem de R$ 6.000,00 em março de 2027?',
      history: [],
      repos,
      provider: null,
      webSearch: false,
      now: () => new Date('2026-10-22T12:00:00-03:00'),
    });
    expect(a.text).toMatch(/Para juntar R\$\s6\.000,00 até 31\/03\/2027/);
    expect(a.text).not.toMatch(/Uma compra de/);
    expect(fetchCalls).toBe(0);
  });
});
