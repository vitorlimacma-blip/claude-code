import { splitEvenly } from './financeQueries';
import type { Cents, DateKey } from './types';

// Whether a goal (a trip, a purchase) fits the person's finances, by dates
// (AI contract, annex M). The code calculates; nothing here searches prices,
// assumes yield, credit or uncertain income, or touches the emergency reserve.

/** What the goal's amount means: never treated as a verified market price. */
export type BudgetKind = 'target_ceiling' | 'researched_budget' | 'contracted' | 'informal_estimate';

export interface FeasibilityInput {
  /** Total the person will pay for the goal (their share, not the group's). */
  target: Cents;
  budgetKind: BudgetKind;
  /** Already paid towards it (counts once: reduces what is still owed). */
  alreadyPaid: Cents;
  /** Money already set aside for this goal (not the emergency reserve). */
  reserved: Cents;
  /** Dates the person can save, ascending. */
  contributionDates: DateKey[];
  /** Payments of the goal still due, with dates (e.g. a ticket due before saving finishes). */
  payments: { date: DateKey; amount: Cents; label: string }[];
  /** Confirmed monthly income only (the conservative case). */
  monthlyIncomeConfirmed: Cents;
  /** Monthly spending by component; essentials included. */
  monthlyExpenses: Record<string, Cents>;
  /** Extra monthly safety margin the person keeps (not an expense, not the emergency reserve). */
  protectionMargin: Cents;
  /** Optional reductions the person may choose, each a scenario, never a fact. */
  optionalReductions: { category: string; baseline: Cents; reduction: Cents }[];
  /** Cash free for the goal at the start (not reserves, not the emergency fund). */
  startingFreeCash?: Cents;
}

export type FeasibilityStatus = 'fits' | 'fits_with_adjustment' | 'does_not_fit' | 'cash_short_on_date' | 'missing_data';

export interface CashEvent {
  date: DateKey;
  kind: 'contribution' | 'payment';
  amount: Cents;
  /** Money accumulated for the goal right after this event. */
  balance: Cents;
}

export interface FeasibilityScenario {
  monthlyExpenses: Cents;
  /** Income − expenses − protection margin, never negative. */
  safeMonthlyCapacity: Cents;
  /** reserved + capacity × contribution dates (what can be gathered by the last date). */
  endFunding: Cents;
  /** Required per date − capacity, when positive. */
  monthlyGap: Cents;
  calendar: CashEvent[];
  /** First payment date when the gathered money doesn't cover what is due. */
  shortOn: DateKey | null;
}

export interface FeasibilityResult {
  status: FeasibilityStatus;
  /** What is still to gather: target − already paid − reserved. */
  fundingGap: Cents;
  requiredContributions: Cents[];
  base: FeasibilityScenario;
  /** Only when the base doesn't fit and optional reductions were given. */
  withReductions: (FeasibilityScenario & { reduction: Cents }) | null;
  assumptions: string[];
  missingData: string[];
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

function scenario(input: FeasibilityInput, monthlyExpenses: Cents, required: Cents[]): FeasibilityScenario {
  const capacity = Math.max(0, input.monthlyIncomeConfirmed - monthlyExpenses - input.protectionMargin);
  const events: CashEvent[] = [];
  const timeline = [
    ...input.contributionDates.map((date) => ({ date, kind: 'contribution' as const, amount: capacity })),
    ...input.payments.map((p) => ({ date: p.date, kind: 'payment' as const, amount: p.amount })),
  ].sort((a, b) => a.date.localeCompare(b.date) || (a.kind === 'contribution' ? -1 : 1));
  // Money gathered for the goal: what is reserved plus free cash at the start, then contributions minus payments.
  let balance = input.reserved + (input.startingFreeCash ?? 0);
  let shortOn: DateKey | null = null;
  for (const e of timeline) {
    balance += e.kind === 'contribution' ? e.amount : -e.amount;
    events.push({ ...e, balance });
    if (balance < 0 && shortOn === null) shortOn = e.date;
  }
  const perDate = required[0] ?? 0;
  return {
    monthlyExpenses,
    safeMonthlyCapacity: capacity,
    endFunding: input.reserved + capacity * input.contributionDates.length,
    monthlyGap: Math.max(0, perDate - capacity),
    calendar: events,
    shortOn,
  };
}

export function assessGoalFeasibility(input: FeasibilityInput): FeasibilityResult {
  const assumptions = [
    input.budgetKind === 'target_ceiling'
      ? 'O valor é o teto que você escolheu, não um preço pesquisado: mostra se dá para juntar, não quanto a viagem custa.'
      : input.budgetKind === 'contracted'
        ? 'Valor contratado informado por você.'
        : 'Valor informado por você, sem pesquisa de preço.',
    'Só receitas confirmadas entram; renda extra incerta fica fora do caso conservador.',
    'Sem rendimento, empréstimo ou limite de cartão para fechar a conta.',
    'A reserva de emergência não é usada.',
  ];
  const missingData: string[] = [];
  if (input.contributionDates.length === 0) missingData.push('Faltam as datas em que você pode guardar (ou a data da viagem).');
  if (input.target <= 0) missingData.push('Falta o valor da meta.');
  const fundingGap = Math.max(0, input.target - input.alreadyPaid - input.reserved);
  const required = input.contributionDates.length > 0 ? splitEvenly(fundingGap, input.contributionDates.length) : [];
  const baseExpenses = sum(Object.values(input.monthlyExpenses));
  const base = scenario(input, baseExpenses, required);
  const enough = (s: FeasibilityScenario) => s.endFunding >= input.target - input.alreadyPaid && s.shortOn === null;

  let withReductions: FeasibilityResult['withReductions'] = null;
  if (!enough(base) && input.optionalReductions.length > 0) {
    // Each reduction applies to its own category once; overlapping suggestions are not summed twice.
    const byCategory = new Map<string, Cents>();
    for (const r of input.optionalReductions) byCategory.set(r.category, Math.max(byCategory.get(r.category) ?? 0, Math.min(r.reduction, r.baseline)));
    const reduction = sum([...byCategory.values()]);
    withReductions = { ...scenario(input, baseExpenses - reduction, required), reduction };
  }

  let status: FeasibilityStatus;
  if (missingData.length > 0) status = 'missing_data';
  else if (base.shortOn !== null && base.endFunding >= input.target - input.alreadyPaid) status = 'cash_short_on_date';
  else if (enough(base)) status = 'fits';
  else if (withReductions && enough(withReductions)) status = 'fits_with_adjustment';
  else status = 'does_not_fit';
  return { status, fundingGap, requiredContributions: required, base, withReductions, assumptions, missingData };
}

/** Group prices: the person's share, from the price unit and who pays (never divided by travellers automatically). */
export function personalShare(input: { price: Cents; unit: 'per_person' | 'group'; travellers: number; payers: number }): {
  total: Cents;
  share: Cents | null;
  question: string | null;
} {
  const total = input.unit === 'per_person' ? input.price * input.travellers : input.price;
  if (input.payers < 1) return { total, share: null, question: 'Quantas pessoas vão dividir o pagamento?' };
  const parts = splitEvenly(total, input.payers);
  return { total, share: parts[0], question: input.payers !== input.travellers ? 'O valor considera quem paga, não quantos viajam; confirme a divisão.' : null };
}
