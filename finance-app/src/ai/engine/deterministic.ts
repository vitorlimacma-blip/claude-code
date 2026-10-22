import { addMonths, DEFAULT_TIME_ZONE, formatDateBR, monthRange, todayKey } from '../../domain/dates';
import { compoundFutureValue, spendingSummary } from '../../domain/financeQueries';
import { formatCents } from '../../domain/money';
import type { Category, Cents } from '../../domain/types';
import { checkAnswer, type AnswerCheck } from '../assistant/validate';
import type { Evidence } from '../assistant/evidence';
import { createContractTools } from '../finance/contractTools';
import { invokeFinanceTool, type FinanceResult, type FinanceSession, type FinanceTool } from '../finance/tools';
import { knowledgeBase, type KnowledgeBase } from '../knowledge/base';
import { classify, plainText, type Classification, type Intent } from './intent';
import { registerFor, soberOpening, type Register } from './voice';

// The answer engine that needs no model (mode "deterministic"): code reads
// the intent, calls the contract's tools and writes the answer from their
// results, so covered questions work offline with no keys (AI contract §2, §4).

export type AnswerMode = 'deterministic' | 'local_model' | 'external_opt_in';
export type EvidenceStatus = 'sufficient' | 'partial' | 'missing' | 'conflicting';

export interface TypedFact {
  label: string;
  cents: Cents;
  /** Evidence reference ("E1") of the tool result it came from. */
  ref: string;
}

/** The response contract (§4): text plus everything needed to check it. */
export interface AnswerContract {
  answer: string;
  facts: TypedFact[];
  evidence: { toolResultIds: string[]; transactionIds: string[]; chunkIds: string[] };
  assumptions: string[];
  missingData: string[];
  evidenceStatus: EvidenceStatus;
  mode: AnswerMode;
  intent: Intent;
  register: Register;
  /** Evidence shown in the app (period, criteria, records), one per tool result. */
  evidences: Evidence[];
  check: AnswerCheck;
  /** The question is outside what rules can answer; a model (local or authorized) would be needed. */
  needsModel: boolean;
  /** A memory proposal created by this answer, for the person to confirm or discard. */
  memoryProposalId?: string;
  /** Memories that match a "forget" request; deleting needs the person's confirmation. */
  forgetCandidates?: { id: string; text: string }[];
}

interface Ctx {
  session: FinanceSession;
  tools: FinanceTool[];
  kb: KnowledgeBase;
  categories: Category[];
  today: string;
  results: FinanceResult[];
  evidences: Evidence[];
  facts: TypedFact[];
  state: { repairsUsed: number };
}

const ESTIMATE_TOOLS = new Set(['get_cashflow_forecast', 'simulate_purchase']);

async function call(ctx: Ctx, name: string, args: unknown): Promise<{ r: FinanceResult<any>; ref: string }> {
  const r = (await invokeFinanceTool(ctx.tools, { name, arguments: args }, ctx.session, ctx.state)) as FinanceResult<any>;
  ctx.results.push(r);
  const ref = `E${ctx.evidences.length + 1}`;
  const chunks = r.chunkIds ?? [];
  ctx.evidences.push({
    ref,
    title: evidenceTitle(r),
    kind: chunks.length > 0 ? 'documento' : ESTIMATE_TOOLS.has(name) ? 'estimativa' : 'fato',
    period: r.period,
    criteria: [...r.assumptions, ...r.missingData],
    transactionIds: r.transactionIds,
    amounts: [],
    ...(chunks.length > 0 && { chunkIds: chunks }),
  });
  return { r, ref };
}

function evidenceTitle(r: FinanceResult): string {
  const p = r.period ? ` · ${formatDateBR(r.period.from)} a ${formatDateBR(r.period.to)}` : '';
  const titles: Record<string, string> = {
    get_spending_summary: 'Receitas e despesas',
    get_account_balances: `Saldos em ${formatDateBR(r.referenceDate)}`,
    get_budget_deviations: 'Orçamento e realizado',
    get_cashflow_forecast: 'Saldo previsto (só confirmados)',
    simulate_purchase: 'Simulação de compra',
    get_goal_plan: 'Plano da meta',
    search_knowledge: 'Regras do app',
    lookup_reference: 'Catálogo de referências',
    get_user_memory: 'Memória',
  };
  return `${titles[r.tool] ?? r.tool}${p}`;
}

function fact(ctx: Ctx, label: string, cents: Cents, ref: string): string {
  ctx.facts.push({ label, cents, ref });
  return formatCents(cents);
}

const NUMBER_WORDS: Record<string, number> = { um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, doze: 12 };

/** Answers a question with rules and the contract's tools only. */
export async function answerDeterministically(
  text: string,
  session: FinanceSession,
  options: { kb?: KnowledgeBase; externalAvailable?: boolean; webAllowed?: boolean } = {}
): Promise<AnswerContract> {
  const today = todayKey(session.now(), DEFAULT_TIME_ZONE);
  const categories = await session.repos.categories.list();
  const ctx: Ctx = {
    session,
    tools: createContractTools(options.kb),
    kb: options.kb ?? knowledgeBase(),
    categories,
    today,
    results: [],
    evidences: [],
    facts: [],
    state: { repairsUsed: 0 },
  };
  const c = classify(text, today, categories);
  const register = registerFor(text);
  const built = await respond(c, text, ctx, options);
  const lines = [register === 'sober' && c.intent !== 'distress' ? soberOpening() : null, built.text].filter(Boolean) as string[];
  let answer = lines.join('\n\n');
  // Brevity asked: keep the first paragraph (the conclusion with its reference).
  if (register === 'brief') answer = answer.split(/\n\s*\n/)[0];
  for (const e of ctx.evidences) e.amounts = ctx.facts.filter((f) => f.ref === e.ref).map((f) => f.cents);
  const check = checkAnswer(answer, ctx.evidences);
  const missing = ctx.results.flatMap((r) => r.missingData);
  const statuses = ctx.results.map((r) => r.status);
  const evidenceStatus: EvidenceStatus =
    built.status ?? (ctx.results.length === 0 || statuses.every((s) => s !== 'ok') ? 'missing' : ctx.results.some((r) => r.completeness !== 'complete') || missing.length > 0 ? 'partial' : 'sufficient');
  return {
    answer,
    facts: ctx.facts,
    evidence: {
      toolResultIds: ctx.evidences.map((e) => e.ref),
      transactionIds: [...new Set(ctx.results.flatMap((r) => r.transactionIds))],
      chunkIds: [...new Set(ctx.results.flatMap((r) => r.chunkIds ?? []))],
    },
    assumptions: [...new Set(ctx.results.flatMap((r) => r.assumptions))],
    missingData: [...new Set(missing)],
    evidenceStatus,
    mode: 'deterministic',
    intent: c.intent,
    register,
    evidences: ctx.evidences,
    check,
    needsModel: built.needsModel ?? false,
    memoryProposalId: built.memoryProposalId,
    forgetCandidates: built.forgetCandidates,
  };
}

interface Built {
  text: string;
  status?: EvidenceStatus;
  needsModel?: boolean;
  memoryProposalId?: string;
  forgetCandidates?: { id: string; text: string }[];
}

const categoryName = (ctx: Ctx, id: string | null) => (id ? (ctx.categories.find((x) => x.id === id)?.name ?? '') : '');

async function respond(c: Classification, text: string, ctx: Ctx, options: { externalAvailable?: boolean; webAllowed?: boolean }): Promise<Built> {
  const monthToDate = { from: `${ctx.today.slice(0, 7)}-01`, to: ctx.today, label: 'este mês, até hoje' };
  switch (c.intent) {
    case 'spending_summary': {
      if (!c.period) {
        return {
          text: 'De qual período você quer saber? Por exemplo: este mês até hoje, mês passado ou outubro. Assim eu não chuto um intervalo.',
          status: 'missing',
        };
      }
      const cat = categoryName(ctx, c.categoryId);
      const { r, ref } = await call(ctx, 'get_spending_summary', { from: c.period.from, to: c.period.to, regime: 'consumption', category: cat });
      if (r.status === 'insufficient_data') {
        return { text: `Não há lançamentos registrados de ${formatDateBR(c.period.from)} a ${formatDateBR(c.period.to)} [${ref}]. Isso não quer dizer que não houve gasto ou renda: o período simplesmente não está no app.` };
      }
      if (r.status !== 'ok') return { text: r.errors?.join(' ') ?? 'Não consegui calcular esse período.' };
      const d = r.data;
      const partial = r.completeness === 'partial' ? '\n\nObservação: os registros começam depois do início do período, então o total pode estar incompleto.' : '';
      if (cat) {
        const refunds = d.refunds > 0 ? `, já descontando ${fact(ctx, 'estornos', d.refunds, ref)} de estorno (bruto ${fact(ctx, 'bruto', d.expensesGross, ref)})` : '';
        return { text: `Em ${c.period.label}, ${cat} somou ${fact(ctx, `gasto líquido de ${cat}`, d.expensesNet, ref)}${refunds} [${ref}].${partial}` };
      }
      const asked = plainText(text);
      if (/renda|recebi|ganhei|receita/.test(asked) && !/despesa|gast|resultado/.test(asked)) {
        return { text: `Em ${c.period.label}, as receitas registradas somam ${fact(ctx, 'receitas', d.income, ref)} [${ref}].${partial}` };
      }
      return {
        text:
          `Em ${c.period.label}, o resultado foi ${fact(ctx, 'resultado', d.result, ref)} [${ref}]: receitas de ${fact(ctx, 'receitas', d.income, ref)} e despesas de ${fact(ctx, 'despesas líquidas', d.expensesNet, ref)}.` +
          `\n\n- Despesas brutas: ${fact(ctx, 'despesas brutas', d.expensesGross, ref)}\n- Estornos descontados: ${fact(ctx, 'estornos', d.refunds, ref)}\n- Transferências entre suas contas e pagamentos de fatura não entram.${partial}`,
      };
    }

    case 'budget_deviation': {
      const p = c.period ?? monthToDate;
      const cat = categoryName(ctx, c.categoryId);
      const { r, ref } = await call(ctx, 'get_budget_deviations', { from: p.from, to: p.to, category: cat });
      if (r.status !== 'ok') return { text: `${r.missingData.concat(r.errors ?? []).join(' ')} [${ref}]` };
      const rows = (r.data as { category: string; actual: number; budget: number; deviation: number }[]).map(
        (d) =>
          `- **${d.category}**: ${fact(ctx, `realizado ${d.category}`, d.actual, ref)} de ${fact(ctx, `orçamento ${d.category}`, d.budget, ref)}, ` +
          (d.deviation > 0 ? `passou ${fact(ctx, `desvio ${d.category}`, d.deviation, ref)}` : `sobram ${fact(ctx, `folga ${d.category}`, -d.deviation, ref)}`)
      );
      const first = r.data[0];
      const head =
        rows.length === 1
          ? `Em ${p.label}, ${first.category} está em ${formatCents(first.actual)} para um orçamento de ${formatCents(first.budget)}: ${first.deviation > 0 ? `passou ${formatCents(first.deviation)}` : `ainda sobram ${formatCents(-first.deviation)}`} [${ref}].`
          : `Orçamentos de ${p.label} [${ref}]:`;
      return { text: rows.length === 1 ? head : `${head}\n\n${rows.join('\n')}` };
    }

    case 'balance': {
      const { r, ref } = await call(ctx, 'get_account_balances', { reference_date: '', account: '' });
      const totals = r.data.totals as { currency: string; balance: number; reserved: number; free: number }[];
      const brl = totals.find((t) => t.currency === 'BRL') ?? totals[0];
      if (!brl) return { text: `Nenhuma conta cadastrada ainda [${ref}].` };
      const lines = (r.data.accounts as { name: string; balance: number; reserved: number; currency: string }[]).map(
        (a) => `- ${a.name}: ${a.currency === 'BRL' ? fact(ctx, `saldo ${a.name}`, a.balance, ref) : `${a.balance / 100} ${a.currency}`}${a.reserved > 0 ? ` (reservado ${fact(ctx, `reservado ${a.name}`, a.reserved, ref)})` : ''}`
      );
      const reserved = brl.reserved > 0 ? ` Desse total, ${fact(ctx, 'reservado', brl.reserved, ref)} está reservado (emergência ou metas), então o livre é ${fact(ctx, 'livre', brl.free, ref)}.` : '';
      const other = totals.length > 1 ? '\n\nHá contas em outra moeda: elas aparecem separadas, sem somar sem câmbio.' : '';
      return {
        text: `Hoje (${formatDateBR(ctx.today)}) suas contas somam ${fact(ctx, 'saldo consolidado', brl.balance, ref)} [${ref}].${reserved} Saldo somado não é tudo dinheiro livre para gastar: limite de cartão não entra e reservas ficam à parte.\n\n${lines.join('\n')}${other}`,
      };
    }

    case 'forecast': {
      const horizon = c.period && c.period.to > ctx.today ? c.period.to : monthRange(ctx.today.slice(0, 7)).to;
      const { r, ref } = await call(ctx, 'get_cashflow_forecast', { horizon_end: horizon });
      if (r.status !== 'ok') return { text: `${r.missingData.concat(r.errors ?? []).join(' ')} [${ref}]` };
      const d = r.data;
      const out = -d.items.filter((i: { amount: number }) => i.amount < 0).reduce((s: number, i: { amount: number }) => s + i.amount, 0);
      return {
        text:
          `Com o que está cadastrado, a previsão para ${formatDateBR(horizon)} é ${fact(ctx, 'saldo previsto', d.endBalance, ref)} nas contas do dia a dia [${ref}]. É uma estimativa condicionada: só entram compromissos confirmados (${fact(ctx, 'compromissos', out, ref)}).` +
          `\n\n- Saldo hoje: ${fact(ctx, 'saldo hoje', d.startBalance, ref)}\n- Gastos variáveis ainda não lançados não entram.` +
          (d.unconfirmedIncomes.length > 0 ? '\n- Receitas esperadas e não confirmadas ficaram fora.' : ''),
      };
    }

    case 'purchase_simulation': {
      const amount = c.amount ?? 1;
      const { r, ref } = await call(ctx, 'simulate_purchase', { amount_cents: amount, date: '' });
      if (r.status !== 'ok') return { text: `${r.missingData.concat(r.errors ?? []).join(' ')} [${ref}]` };
      const d = r.data;
      const memory = await ctx.session.repos.memory.list(ctx.session.userScope, { type: 'preference', status: 'confirmed' });
      const keepsReserve = memory.some((m) => m.value.kind === 'text' && /reserva/.test(plainText(m.value.text)));
      const pref = keepsReserve ? '\n\nComo você pediu, a simulação preserva a sua reserva: só as contas do dia a dia entram.' : '';
      const floorNote = d.floorConfigured ? '' : '\n\nVocê ainda não definiu um saldo mínimo; comparei com zero.';
      if (!c.amount) {
        return {
          text: `Pelas contas de hoje, sobram ${fact(ctx, 'folga acima do piso', d.availableAboveFloor, ref)} acima do saldo mínimo até o fim do mês [${ref}]. Vale para o cenário confirmado, não é uma promessa de disponibilidade futura.${floorNote}${pref}`,
        };
      }
      return {
        text: d.fits
          ? `Cabe: depois de ${fact(ctx, 'compra', d.amount, ref)}, a previsão fica em ${fact(ctx, 'previsão após a compra', d.forecastAfter, ref)}, acima do saldo mínimo de ${fact(ctx, 'saldo mínimo', d.floor, ref)} [${ref}].${floorNote}${pref}`
          : `Uma compra de ${fact(ctx, 'compra', d.amount, ref)} agora deixaria a previsão em ${fact(ctx, 'previsão após a compra', d.forecastAfter, ref)}, ${fact(ctx, 'abaixo do piso', d.shortfall, ref)} abaixo do saldo mínimo de ${fact(ctx, 'saldo mínimo', d.floor, ref)} que você definiu [${ref}]. Podemos olhar outra data ou o que dá para ajustar.${floorNote}${pref}`,
      };
    }

    case 'goal_plan': {
      const { r, ref } = await call(ctx, 'get_goal_plan', { goal: '' });
      if (r.status !== 'ok') return { text: `${r.missingData.concat(r.errors ?? []).join(' ')} [${ref}]` };
      const parts = (r.data as { name: string; remaining: number; status: string; contributions: { date: string; amount: number }[] }[]).map((g) => {
        if (g.status === 'done') return `- **${g.name}**: já está completa.`;
        if (g.status === 'no_schedule') return `- **${g.name}**: faltam ${fact(ctx, `falta ${g.name}`, g.remaining, ref)}; para dividir, preciso saber quando você pretende guardar.`;
        return `- **${g.name}**: faltam ${fact(ctx, `falta ${g.name}`, g.remaining, ref)}, em ${g.contributions.length} aportes: ${g.contributions.map((x) => `${fact(ctx, `aporte ${x.date}`, x.amount, ref)} em ${formatDateBR(x.date)}`).join(', ')}.`;
      });
      return { text: `${parts.length === 1 ? parts[0].replace(/^- /, '') : parts.join('\n')} [${ref}]\n\nSem rendimento nem juros na conta; os centavos que sobram da divisão vão nos primeiros aportes.` };
    }

    case 'compare_periods': {
      const cur = c.period && c.period.to === ctx.today ? c.period : monthToDate;
      const day = Number(cur.to.slice(8, 10));
      const prevMonth = addMonths(cur.from.slice(0, 7), -1);
      const prevEnd = monthRange(prevMonth).to;
      const prevTo = `${prevMonth}-${String(Math.min(day, Number(prevEnd.slice(8, 10)))).padStart(2, '0')}`;
      const a = await call(ctx, 'get_spending_summary', { from: cur.from, to: cur.to, regime: 'consumption', category: '' });
      const b = await call(ctx, 'get_spending_summary', { from: `${prevMonth}-01`, to: prevTo, regime: 'consumption', category: '' });
      if (a.r.status !== 'ok' || b.r.status !== 'ok') return { text: `Não há dados suficientes para comparar os dois períodos [${a.ref}] [${b.ref}].` };
      const [rows, accounts] = await Promise.all([ctx.session.repos.transactions.list({ from: `${prevMonth}-01`, to: cur.to }), ctx.session.repos.accounts.list({ includeArchived: true })]);
      const roots = ctx.categories.filter((x) => !x.parentId && x.kind === 'expense');
      const changes = roots
        .map((root) => {
          const ids = new Set(ctx.categories.filter((x) => x.id === root.id || x.parentId === root.id).map((x) => x.id));
          const now = spendingSummary({ rows, accounts, from: cur.from, to: cur.to, regime: 'consumption', categoryIds: ids }).expensesNet;
          const before = spendingSummary({ rows, accounts, from: `${prevMonth}-01`, to: prevTo, regime: 'consumption', categoryIds: ids }).expensesNet;
          return { name: root.name, diff: now - before };
        })
        .filter((x) => x.diff !== 0)
        .sort((x, y) => Math.abs(y.diff) - Math.abs(x.diff))
        .slice(0, 4);
      const diff = a.r.data.expensesNet - b.r.data.expensesNet;
      return {
        text:
          `De ${formatDateBR(cur.from)} a ${formatDateBR(cur.to)} as despesas somam ${fact(ctx, 'despesas atuais', a.r.data.expensesNet, a.ref)} [${a.ref}], contra ${fact(ctx, 'despesas anteriores', b.r.data.expensesNet, b.ref)} nos mesmos dias do mês anterior [${b.ref}]: ${diff >= 0 ? 'alta' : 'queda'} de ${formatCents(Math.abs(diff))}.` +
          (changes.length ? `\n\nO que mais mudou:\n${changes.map((x) => `- **${x.name}**: ${x.diff > 0 ? '+' : '−'}${fact(ctx, `variação ${x.name}`, Math.abs(x.diff), a.ref)}`).join('\n')}` : '') +
          '\n\nA comparação usa os mesmos dias de cada mês; o mês atual ainda não terminou.',
      };
    }

    case 'transfer_question': {
      const k = await call(ctx, 'search_knowledge', { query: 'transferência entre contas próprias neutra despesa' });
      return {
        text: `Não. Uma transferência entre contas suas muda o saldo de cada conta, mas é neutra no total e não entra como despesa nem como receita [${k.ref}]. Dá para conferir: ela não aparece no resumo de despesas.`,
      };
    }

    case 'interest_simulation': {
      const t = plainText(text);
      const rate = /(\d+(?:,\d+)?)\s?%/.exec(t);
      const periods = /(\d+|um|uma|dois|duas|tres|quatro|cinco|seis|doze)\s+(meses|mes|anos|ano)/.exec(t);
      if (!c.amount || !rate || !periods) return { text: 'Para simular, preciso do valor, da taxa por período e de quantos períodos. Exemplo: R$ 1.000 a 1% ao mês por 2 meses.', status: 'missing' };
      const n = /\d/.test(periods[1]) ? Number(periods[1]) : NUMBER_WORDS[periods[1]];
      const decimal = (Number(rate[1].replace(',', '.')) / 100).toString();
      const fv = compoundFutureValue(c.amount, decimal, n);
      ctx.evidences.push({ ref: 'E1', title: 'Simulação de juros compostos', kind: 'estimativa', period: null, criteria: [`Taxa de ${rate[1]}% por período, ${n} período(s), sem aportes, impostos ou tarifas.`, 'Taxa informada na pergunta; não é condição de mercado.'], transactionIds: [], amounts: [] });
      return {
        text: `Com ${fact(ctx, 'principal', c.amount, 'E1')} a ${rate[1]}% por período durante ${n} período(s), o valor futuro seria ${fact(ctx, 'valor futuro', fv, 'E1')} [E1]. É uma simulação: sem impostos, tarifas ou aportes, e a taxa é a que você informou.`,
      };
    }

    case 'knowledge': {
      const { r, ref } = await call(ctx, 'search_knowledge', { query: text.slice(0, 200) });
      if (r.status !== 'ok') {
        return {
          text: `Não encontrei isso nas regras e materiais aprovados do app [${ref}].${options.webAllowed ? ' Posso pesquisar com o provedor externo, se você pedir.' : ' Sem a permissão de busca na internet, não tenho outra fonte.'}`,
          status: 'missing',
          needsModel: !!options.externalAvailable,
        };
      }
      const top = r.data[0] as { title: string; untrustedText: string };
      return { text: `Pela regra do app "${top.title}": ${top.untrustedText} [${ref}]` };
    }

    case 'source_citation': {
      const title = /livro\s+(.+?)(\s+que|\?|$)/i.exec(text)?.[1] ?? text;
      const { ref } = await call(ctx, 'lookup_reference', { title: title.slice(0, 200) });
      return {
        text: `Não tenho esse texto: o livro está só no catálogo de referências, sem o conteúdo importado. Por isso não posso indicar página, edição ou trecho, e não vou inventar uma citação [${ref}].`,
        status: 'missing',
      };
    }

    case 'memory_save': {
      const { r, ref } = await call(ctx, 'propose_memory_update', { type: 'preference', text: text.slice(0, 300) });
      if (r.status !== 'ok') return { text: r.errors?.join(' ') ?? 'Não consegui preparar a memória.' };
      return { text: `Posso guardar isto como preferência sua. Só vale depois que você confirmar, e dá para editar ou apagar em Ajustes › Memória do assistente [${ref}].`, memoryProposalId: r.data.proposalId };
    }

    case 'memory_forget': {
      const items = await ctx.session.repos.memory.list(ctx.session.userScope);
      const words = plainText(text).split(/[^a-z0-9]+/).filter((w) => w.length > 4);
      const scored = items
        .filter((m) => m.value.kind === 'text')
        .map((m) => ({ m, score: words.filter((w) => plainText((m.value as { text: string }).text).includes(w)).length }))
        .filter((x) => x.score > 0)
        .sort((a, b) => b.score - a.score);
      if (scored.length === 0) return { text: 'Não encontrei uma memória com isso. As memórias guardadas ficam em Ajustes › Memória do assistente.' };
      return {
        text: 'Encontrei isto na memória. Confirme abaixo para apagar de vez; depois disso ela deixa de influenciar as respostas.',
        forgetCandidates: scored.slice(0, 3).map((x) => ({ id: x.m.id, text: (x.m.value as { text: string }).text })),
      };
    }

    case 'memory_show': {
      const { r, ref } = await call(ctx, 'get_user_memory', { type: 'all' });
      const items = r.data as { type: string; value: unknown }[];
      if (items.length === 0) return { text: `Não tenho nenhuma memória confirmada sobre você [${ref}].` };
      return { text: `Isto é o que está confirmado na memória [${ref}]:\n\n${items.map((i) => `- ${typeof i.value === 'string' ? i.value : JSON.stringify(i.value)}`).join('\n')}` };
    }

    case 'current_rate':
      return {
        text: options.webAllowed
          ? 'Para um valor atual, preciso de uma fonte datada. Posso pesquisar com o provedor externo, já que a busca na internet está permitida.'
          : 'Não tenho uma fonte atual e datada para esse valor aqui, então não vou afirmar quanto está hoje. Se você permitir a busca na internet (Ajustes › Inteligência artificial), dá para consultar com data e fonte.',
        status: 'missing',
        needsModel: !!options.webAllowed,
      };

    case 'investment_advice':
    case 'securities_analysis':
      return {
        text:
          'Escolher ou comparar ações e montar carteira para você é uma análise e uma recomendação de investimento que este app ainda não oferece: exige uma operação com requisitos próprios. ' +
          'Posso explicar conceitos (como dividend yield, risco e custos), organizar sua reserva e simular cenários com os seus números.',
        status: 'missing',
      };

    case 'order_execution':
      return { text: 'Não movimento dinheiro, não faço Pix, compras nem ordens. Posso simular o efeito no seu saldo e você decide e executa no seu banco.', status: 'missing' };

    case 'tax_or_legal':
      return {
        text:
          'Regras de imposto e leis dependem do país, da sua residência fiscal, do produto e da data. Não tenho uma base tributária atualizada aqui, então não vou afirmar valores ou limites atuais. ' +
          'Me diga o país, o tipo de operação e a data, e consulte a fonte oficial (Receita Federal, no Brasil) ou um profissional.',
        status: 'missing',
      };

    case 'credential_claim':
      return { text: 'Não posso me apresentar com registro, certificação ou experiência que não tenho. Sou o assistente do app: explico seus números e conceitos, sem ser um profissional autorizado.', status: 'missing' };

    case 'guarantee_request':
      return { text: 'Não dá para prometer retorno ou taxa sem contrato e fonte: investimentos podem render menos ou perder valor. Posso simular cenários com uma taxa que você informar, deixando claro que é hipótese.', status: 'missing' };

    case 'other_person_data':
      return { text: 'Não tenho acesso a dados de outra pessoa, e não daria sem a autorização dela. Uma meta compartilhada não abre os gastos privados de ninguém.', status: 'missing' };

    case 'distress': {
      const { r, ref } = await call(ctx, 'get_cashflow_forecast', { horizon_end: monthRange(ctx.today.slice(0, 7)).to });
      const base = 'Entendo a preocupação. Vamos por partes, começando pelo essencial: moradia e comida vêm antes de qualquer outra conta.';
      if (r.status !== 'ok') return { text: `${base} Se você cadastrar suas contas e o que entra, consigo mostrar o que cabe até o fim do mês.` };
      return {
        text: `${base}\n\nPelo que está cadastrado, as contas do dia a dia têm ${fact(ctx, 'saldo hoje', r.data.startBalance, ref)} hoje e a previsão até o fim do mês é ${fact(ctx, 'saldo previsto', r.data.endBalance, ref)} [${ref}]. Se quiser, olhamos juntos quais compromissos dá para renegociar ou adiar.`,
      };
    }

    default:
      return {
        text: options.externalAvailable
          ? 'Essa pergunta precisa de um modelo de IA. Posso enviá-la ao provedor externo que você autorizou.'
          : 'Essa pergunta ainda precisa de um modelo de IA, e nenhum está disponível agora. Sem modelo, consigo responder sobre gastos de um período, orçamento, saldos, previsão do mês, compras, metas e as regras do app.',
        status: 'missing',
        needsModel: true,
      };
  }
}
