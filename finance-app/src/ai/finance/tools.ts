import type { Repositories } from '../../data/repositories';
import { addMonths, DEFAULT_TIME_ZONE, formatDateBR, monthRange, todayKey } from '../../domain/dates';
import {
  accountBalances,
  budgetDeviations,
  cashflowForecast,
  coverage,
  goalPlan,
  simulatePurchase,
  spendingSummary,
  withSubcategories,
  type Completeness,
  type Regime,
} from '../../domain/financeQueries';
import { DEFAULT_CURRENCY, type Account, type Category, type Cents, type DateKey } from '../../domain/types';
import { toJsonSchema, validateArgs, type ArgsSpec } from './validation';

// Financial tools of the AI contract (§4). The model may propose calls; the
// app validates them strictly and runs deterministic code against the local
// database. The user comes from the session, never from an argument, and no
// tool writes, runs SQL or reaches the network.

export { LOCAL_USER_SCOPE } from '../session';

export const FINANCE_SETTINGS = {
  /** `{ amount: Cents }`: the lowest balance the person wants to keep in the operating accounts. */
  operatingFloor: 'finance.operatingFloor',
  /** `string[]`: accounts used for day-to-day spending. Default: checking accounts and wallets. */
  operatingAccounts: 'finance.operatingAccounts',
  /** `{ amount: Cents }`: extra monthly safety margin kept out of savings plans (not an expense). */
  protectionMargin: 'finance.protectionMargin',
} as const;

export interface FinanceSession {
  userScope: string;
  repos: Repositories;
  now: () => Date;
}

export type FinanceStatus = 'ok' | 'insufficient_data' | 'ambiguous' | 'invalid_arguments' | 'failed';

/** Every result carries what it covers and what it does not (contract §3). */
export interface FinanceResult<T = unknown> {
  tool: string;
  status: FinanceStatus;
  userScope: string;
  period: { from: DateKey; to: DateKey } | null;
  referenceDate: DateKey;
  regime: Regime | null;
  filters: Record<string, string>;
  transactionIds: string[];
  completeness: Completeness;
  assumptions: string[];
  missingData: string[];
  currency: string;
  data: T | null;
  /** For invalid arguments or ambiguity: what to fix or ask. */
  errors?: string[];
  /** Knowledge chunks behind the result (documents, not transactions). */
  chunkIds?: string[];
}

export interface FinanceTool {
  name: string;
  description: string;
  args: ArgsSpec;
  /** JSON Schema for the model (strict: all fields required, no extras). */
  parameters: Record<string, unknown>;
  run(args: Record<string, unknown>, session: FinanceSession): Promise<FinanceResult>;
}

const plain = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();

class Ambiguous extends Error {}

/** One category for a name (exact name or path first), or an error naming the candidates. */
function resolveCategory(query: string, categories: Category[]): Category {
  const q = plain(query);
  const byId = new Map(categories.map((c) => [c.id, c]));
  const path = (c: Category) => plain(c.parentId ? `${byId.get(c.parentId)?.name ?? ''} ${c.name}` : c.name);
  const candidates = categories.filter((c) => !c.archived && !c.deletedAt);
  const exact = candidates.filter((c) => plain(c.name) === q || c.id === query);
  if (exact.length === 1) return exact[0];
  const roots = exact.filter((c) => !c.parentId);
  if (roots.length === 1) return roots[0];
  const partial = candidates.filter((c) => path(c).includes(q));
  if (partial.length === 1) return partial[0];
  const rootPartial = partial.filter((c) => !c.parentId);
  if (rootPartial.length === 1) return rootPartial[0];
  if (partial.length === 0) throw new Ambiguous(`Nenhuma categoria corresponde a "${query}".`);
  throw new Ambiguous(`"${query}" corresponde a: ${partial.map((c) => c.name).join(', ')}. Pergunte qual.`);
}

function operatingScope(accounts: Account[], saved: string[] | null): Set<string> {
  const ids = new Set(accounts.map((a) => a.id));
  const chosen = (saved ?? []).filter((id) => ids.has(id));
  if (chosen.length > 0) return new Set(chosen);
  return new Set(accounts.filter((a) => (a.type === 'checking' || a.type === 'wallet') && !a.archived).map((a) => a.id));
}

const SPENDING_RULE =
  'Receitas e despesas pela natureza: transferências entre contas próprias, pagamentos de fatura, aportes e resgates não contam; estorno vinculado reduz a despesa.';
const REGIME_TEXT: Record<Regime, string> = {
  consumption: 'Visão de consumo: compra no cartão conta na data da compra e cada parcela no seu mês; o pagamento da fatura só liquida.',
  cash: 'Visão de caixa: saídas e entradas das contas bancárias; o pagamento da fatura é a saída, sem somar as compras do cartão.',
};

export function base(tool: string, session: FinanceSession, referenceDate: DateKey): FinanceResult {
  return {
    tool,
    status: 'ok',
    userScope: session.userScope,
    period: null,
    referenceDate,
    regime: null,
    filters: {},
    transactionIds: [],
    completeness: 'complete',
    assumptions: [],
    missingData: [],
    currency: DEFAULT_CURRENCY,
    data: null,
  };
}

export function createFinanceTools(): FinanceTool[] {
  const tool = (name: string, description: string, args: ArgsSpec, run: FinanceTool['run']): FinanceTool => ({
    name,
    description,
    args,
    parameters: toJsonSchema(args),
    run,
  });
  const today = (s: FinanceSession) => todayKey(s.now(), DEFAULT_TIME_ZONE);

  return [
    tool(
      'get_spending_summary',
      'Receitas, despesas (brutas, estornos, líquidas) e resultado num período, na visão de consumo ou de caixa, opcionalmente de uma categoria.',
      {
        from: { type: 'date', description: 'Início do período' },
        to: { type: 'date', description: 'Fim do período, inclusive' },
        regime: { type: 'string', description: 'consumption (padrão do app) ou cash', enum: ['consumption', 'cash'] },
        category: { type: 'string', description: 'Nome da categoria, ou "" para todas' },
      },
      async (a, session) => {
        const { from, to, regime, category } = a as { from: string; to: string; regime: Regime; category: string };
        const ref = today(session);
        const r = base('get_spending_summary', session, ref);
        r.period = { from, to };
        r.regime = regime;
        if (from > to) return { ...r, status: 'invalid_arguments', errors: ['O início vem depois do fim.'] };
        const [rows, accounts, categories] = await Promise.all([
          session.repos.transactions.list({ to }),
          session.repos.accounts.list({ includeArchived: true }),
          session.repos.categories.list(),
        ]);
        let ids: Set<string> | null = null;
        if (category.trim()) {
          try {
            const c = resolveCategory(category, categories);
            ids = withSubcategories(categories, [c.id]);
            r.filters.category = c.name;
          } catch (e) {
            return { ...r, status: 'ambiguous', errors: [(e as Error).message] };
          }
        }
        const cov = coverage(rows, from, to);
        r.completeness = cov.status;
        if (cov.status === 'missing') {
          r.status = 'insufficient_data';
          r.missingData.push(`Não há lançamentos registrados de ${formatDateBR(from)} a ${formatDateBR(to)}; isso não significa gasto zero.`);
          return r;
        }
        if (cov.status === 'partial') r.missingData.push(`Os registros começam em ${formatDateBR(cov.firstDate!)}; antes disso o período não é conhecido.`);
        if (to > ref) r.assumptions.push(`O período vai além de hoje (${formatDateBR(ref)}): inclui lançamentos agendados.`);
        const s = spendingSummary({ rows, accounts, from, to, regime, categoryIds: ids });
        if (s.otherCurrencyIds.length > 0) r.missingData.push(`${s.otherCurrencyIds.length} lançamento(s) em outra moeda ficaram fora (sem câmbio).`);
        r.assumptions.push(SPENDING_RULE, REGIME_TEXT[regime]);
        r.transactionIds = s.transactionIds;
        r.data = s;
        return r;
      }
    ),

    tool(
      'get_account_balances',
      'Saldo de cada conta numa data, com o valor reservado (emergência, metas) e o livre, e totais por moeda. Limite de cartão não é saldo.',
      {
        reference_date: { type: 'date', description: 'Data de referência', optional: true },
        account: { type: 'string', description: 'Nome da conta, ou "" para todas' },
      },
      async (a, session) => {
        const { reference_date, account } = a as { reference_date: string; account: string };
        const ref = reference_date || today(session);
        const r = base('get_account_balances', session, ref);
        const [accounts, balances, reserves] = await Promise.all([
          session.repos.accounts.list(),
          session.repos.accounts.balances(ref),
          session.repos.goals.listReserves(),
        ]);
        let scope: Set<string> | null = null;
        if (account.trim()) {
          const matches = accounts.filter((acc) => plain(acc.name).includes(plain(account)));
          if (matches.length !== 1) {
            return { ...r, status: 'ambiguous', errors: [matches.length === 0 ? `Nenhuma conta corresponde a "${account}".` : `"${account}" corresponde a: ${matches.map((m) => m.name).join(', ')}.`] };
          }
          scope = new Set([matches[0].id]);
          r.filters.account = matches[0].name;
        }
        const data = accountBalances(accounts, balances, reserves, scope);
        r.assumptions.push(
          'Saldo = saldo inicial da conta mais todos os lançamentos até a data de referência; transferências entre contas próprias mudam cada conta e não o total.',
          'Valor reservado faz parte do saldo, mas não está livre para gastar.'
        );
        if (data.totals.length > 1) r.missingData.push('Há contas em moedas diferentes: os totais ficam separados por moeda.');
        r.data = data;
        return r;
      }
    ),

    tool(
      'get_budget_deviations',
      'Realizado contra orçamento no mesmo período, por categoria com orçamento: valor, diferença e percentual (só quando o orçamento não é zero).',
      {
        from: { type: 'date', description: 'Início do período (o orçamento é mensal)' },
        to: { type: 'date', description: 'Fim do período, inclusive' },
        category: { type: 'string', description: 'Nome da categoria, ou "" para todas com orçamento' },
      },
      async (a, session) => {
        const { from, to, category } = a as { from: string; to: string; category: string };
        const ref = today(session);
        const r = base('get_budget_deviations', session, ref);
        r.period = { from, to };
        r.regime = 'consumption';
        if (from > to) return { ...r, status: 'invalid_arguments', errors: ['O início vem depois do fim.'] };
        if (from.slice(0, 7) !== to.slice(0, 7)) {
          return { ...r, status: 'invalid_arguments', errors: ['O orçamento é mensal: use um período dentro de um mesmo mês.'] };
        }
        const [rows, accounts, categories, budgets] = await Promise.all([
          session.repos.transactions.list({ from, to }),
          session.repos.accounts.list({ includeArchived: true }),
          session.repos.categories.list(),
          session.repos.budgets.amountsForMonth(from.slice(0, 7)),
        ]);
        let only: Set<string> | null = null;
        if (category.trim()) {
          try {
            const c = resolveCategory(category, categories);
            only = new Set([c.id]);
            r.filters.category = c.name;
          } catch (e) {
            return { ...r, status: 'ambiguous', errors: [(e as Error).message] };
          }
        }
        const rowsDev = budgetDeviations({ categories, budgets, rows, accounts, from, to, onlyCategoryIds: only });
        if (rowsDev.length === 0) {
          r.status = 'insufficient_data';
          r.missingData.push(only ? 'Esta categoria não tem orçamento definido.' : 'Nenhum orçamento definido para este mês.');
          return r;
        }
        const names = new Map(categories.map((c) => [c.id, c.name]));
        r.transactionIds = rowsDev.flatMap((d) => d.transactionIds);
        r.assumptions.push(SPENDING_RULE, 'Desvio = realizado − orçamento do mesmo período; percentual só quando o orçamento é maior que zero.');
        if (to < monthRange(from.slice(0, 7)).to) r.assumptions.push('O mês ainda não terminou: o realizado é parcial.');
        r.data = rowsDev.map((d) => ({ ...d, category: names.get(d.categoryId) ?? '?' }));
        return r;
      }
    ),

    tool(
      'get_cashflow_forecast',
      'Saldo previsto das contas do dia a dia até uma data, somando só o que está confirmado (lançamentos agendados e contas previstas ainda não pagas). Receitas esperadas aparecem à parte e não entram.',
      { horizon_end: { type: 'date', description: 'Até quando prever (no máximo 1 ano)' } },
      async (a, session) => {
        const { horizon_end } = a as { horizon_end: string };
        const ref = today(session);
        const r = base('get_cashflow_forecast', session, ref);
        if (horizon_end < ref) return { ...r, status: 'invalid_arguments', errors: ['A data final é anterior a hoje.'] };
        if (horizon_end > `${Number(ref.slice(0, 4)) + 1}${ref.slice(4)}`) return { ...r, status: 'invalid_arguments', errors: ['Horizonte maior que um ano.'] };
        r.period = { from: ref, to: horizon_end };
        const [accounts, balances, rows, recurrences, savedScope] = await Promise.all([
          session.repos.accounts.list(),
          session.repos.accounts.balances(ref),
          session.repos.transactions.list({ from: `${addMonths(ref.slice(0, 7), -1)}-01`, to: horizon_end }),
          session.repos.recurrences.list(),
          session.repos.settings.get<string[] | null>(FINANCE_SETTINGS.operatingAccounts, null),
        ]);
        const scope = operatingScope(accounts, savedScope);
        if (scope.size === 0) {
          r.status = 'insufficient_data';
          r.missingData.push('Nenhuma conta do dia a dia (corrente ou carteira) cadastrada.');
          return r;
        }
        const f = cashflowForecast({ accounts, balances, rows, recurrences, scope, referenceDate: ref, horizon: horizon_end });
        const names = new Map(accounts.map((x) => [x.id, x.name]));
        r.filters.accounts = [...scope].map((id) => names.get(id) ?? id).join(', ');
        r.transactionIds = f.items.flatMap((i) => (i.transactionId ? [i.transactionId] : []));
        r.assumptions.push(
          `Parte do saldo em ${formatDateBR(ref)} das contas do dia a dia e soma só compromissos confirmados até ${formatDateBR(horizon_end)}.`,
          'Gastos variáveis ainda não lançados não entram: a previsão é condicionada ao que está cadastrado.'
        );
        if (f.unconfirmedIncomes.length > 0) r.assumptions.push('Receitas esperadas e não confirmadas aparecem à parte e não entram no saldo previsto.');
        if (recurrences.length === 0) {
          r.completeness = 'partial';
          r.missingData.push('Nenhuma conta prevista cadastrada: compromissos não lançados podem faltar.');
        }
        r.data = f;
        return r;
      }
    ),

    tool(
      'simulate_purchase',
      'Simula uma compra hipotética contra o saldo previsto confirmado até o fim do mês e o saldo mínimo que a pessoa escolheu. Nada é gravado.',
      {
        amount_cents: { type: 'integer', description: 'Valor em centavos (R$ 500,00 = 50000)', minimum: 1, maximum: 100_000_000_00 },
        date: { type: 'date', description: 'Data da compra', optional: true },
      },
      async (a, session) => {
        const { amount_cents, date } = a as { amount_cents: number; date: string };
        const ref = today(session);
        const when = date || ref;
        const r = base('simulate_purchase', session, ref);
        if (when < ref) return { ...r, status: 'invalid_arguments', errors: ['A data da compra é anterior a hoje.'] };
        const horizon = monthRange(ref.slice(0, 7)).to;
        const forecast = await createFinanceTools()
          .find((t) => t.name === 'get_cashflow_forecast')!
          .run({ horizon_end: horizon < when ? when : horizon }, session);
        if (forecast.status !== 'ok') return { ...forecast, tool: 'simulate_purchase' };
        const floor = await session.repos.settings.get<{ amount: Cents } | null>(FINANCE_SETTINGS.operatingFloor, null);
        const sim = simulatePurchase(forecast.data as ReturnType<typeof cashflowForecast>, amount_cents, when, floor?.amount ?? 0);
        r.period = forecast.period;
        r.filters = forecast.filters;
        r.transactionIds = forecast.transactionIds;
        r.completeness = forecast.completeness;
        r.assumptions = [...forecast.assumptions, 'Compra hipotética à vista, na conta do dia a dia; sem juros nem parcelas.'];
        r.missingData = [...forecast.missingData];
        if (!floor) r.missingData.push('Saldo mínimo não definido: a simulação compara com zero. Defina o seu em Ajustes.');
        r.data = { ...sim, floorConfigured: !!floor };
        return r;
      }
    ),

    tool(
      'get_goal_plan',
      'Quanto falta para cada meta (alvo − reservado) e como dividir nos aportes planejados, com os centavos fechando exatamente. Não assume rendimento.',
      { goal: { type: 'string', description: 'Nome da meta, ou "" para todas' } },
      async (a, session) => {
        const { goal } = a as { goal: string };
        const ref = today(session);
        const r = base('get_goal_plan', session, ref);
        const [goals, reserves] = await Promise.all([session.repos.goals.list(), session.repos.goals.listReserves()]);
        const chosen = goal.trim() ? goals.filter((g) => plain(g.name).includes(plain(goal))) : goals;
        if (goal.trim() && chosen.length !== 1) {
          return { ...r, status: chosen.length === 0 ? 'insufficient_data' : 'ambiguous', errors: [chosen.length === 0 ? `Nenhuma meta corresponde a "${goal}".` : `"${goal}" corresponde a: ${chosen.map((g) => g.name).join(', ')}.`] };
        }
        if (chosen.length === 0) {
          r.status = 'insufficient_data';
          r.missingData.push('Nenhuma meta cadastrada.');
          return r;
        }
        const plans = chosen.map((g) => ({ name: g.name, deadline: g.deadline, ...goalPlan(g, reserves, ref) }));
        if (plans.some((p) => p.status === 'no_schedule')) r.missingData.push('Meta sem datas de aporte futuras: informe quando pretende guardar.');
        r.assumptions.push('Falta = valor da meta − valor já reservado para ela. Sem rendimento, juros ou inflação.', 'Os centavos que sobram da divisão vão para os primeiros aportes.');
        r.data = plans;
        return r;
      }
    ),
  ];
}

export interface ToolCallState {
  /** Invalid calls already answered with a repair hint (at most one, contract §4). */
  repairsUsed: number;
}

/**
 * Runs one proposed call: unknown tool or invalid arguments are never
 * executed. The first invalid call gets the errors back for one repair; after
 * that the call fails for good, so a model can't loop.
 */
export async function invokeFinanceTool(
  tools: FinanceTool[],
  call: { name: string; arguments: unknown },
  session: FinanceSession,
  state: ToolCallState
): Promise<FinanceResult> {
  const ref = todayKey(session.now(), DEFAULT_TIME_ZONE);
  const tool = tools.find((t) => t.name === call.name);
  const fail = (errors: string[]): FinanceResult => {
    const status: FinanceStatus = state.repairsUsed === 0 ? 'invalid_arguments' : 'failed';
    state.repairsUsed++;
    return { ...base(call.name, session, ref), status, errors };
  };
  if (!tool) return fail([`Ferramenta desconhecida: ${call.name}.`]);
  const checked = validateArgs<Record<string, unknown>>(tool.args, call.arguments);
  if (!checked.ok) return fail(checked.errors);
  return tool.run(checked.value, session);
}
