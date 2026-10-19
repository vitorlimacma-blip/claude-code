import type { Repositories } from '../../data/repositories';
import { computeMonthlyAlert } from '../../domain/alerts';
import { groupByCategoryTree } from '../../domain/categories';
import { addMonths, fromDateKey, monthRange, toDateKey } from '../../domain/dates';
import { ACCOUNT_TYPE_LABELS, PAYMENT_METHOD_LABELS } from '../../domain/labels';
import { formatCents } from '../../domain/money';
import type { Category, Transaction } from '../../domain/types';
import { categoryPath } from '../categorizer';
import type { JsonSchema, LocalTool } from '../types';

// Tool schemas avoid optional/nullable fields (support for them varies between
// providers' strict modes): every field is required, and "" means "no filter".

function objectSchema(properties: Record<string, JsonSchema>): JsonSchema {
  return { type: 'object', properties, required: Object.keys(properties), additionalProperties: false };
}

const dateField = (description: string): JsonSchema => ({ type: 'string', description: `${description} (AAAA-MM-DD).` });

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_ROWS = 50;

function plain(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

function checkDate(value: string, label: string): string {
  if (!DATE_RE.test(value)) throw new Error(`${label} inválida: use AAAA-MM-DD.`);
  return value;
}

const money = (cents: number) => ({ valor: formatCents(cents), centavos: cents });

/**
 * The functions the assistant can call. They run on the device against the
 * local database and return small, aggregated JSON, so questions are answered
 * from real numbers without sending the whole history to the AI provider.
 */
export function createFinanceTools(repos: Repositories, now: () => Date = () => new Date()): LocalTool[] {
  async function loadCategories() {
    const categories = await repos.categories.list();
    return { categories, byId: new Map(categories.map((c) => [c.id, c])) };
  }

  /** Ids of categories whose name (or parent's name) matches `query`, including subcategories. */
  function matchCategories(query: string, categories: Category[], byId: Map<string, Category>): Set<string> | null {
    if (!query.trim()) return null;
    const q = plain(query);
    const ids = new Set<string>();
    for (const c of categories) {
      if (plain(categoryPath(c, byId)).includes(q)) ids.add(c.id);
    }
    for (const c of categories) if (c.parentId && ids.has(c.parentId)) ids.add(c.id);
    if (ids.size === 0) throw new Error(`Nenhuma categoria corresponde a "${query}". Use listar_categorias.`);
    return ids;
  }

  function describe(t: Transaction, byId: Map<string, Category>, accountNames: Map<string, string>) {
    const category = t.categoryId ? byId.get(t.categoryId) : undefined;
    return {
      data: t.date,
      descricao: t.description || '(sem descrição)',
      tipo: t.type,
      ...money(t.amount),
      categoria: category ? categoryPath(category, byId) : t.type.startsWith('transfer') ? 'Transferência' : 'Sem categoria',
      conta: accountNames.get(t.accountId) ?? '?',
      forma_pagamento: PAYMENT_METHOD_LABELS[t.paymentMethod],
    };
  }

  const resumoPeriodo: LocalTool = {
    name: 'resumo_periodo',
    description:
      'Totais de receitas, despesas e resultado num período, com os gastos agrupados por categoria principal. ' +
      'Transferências entre contas próprias não contam.',
    parameters: objectSchema({ de: dateField('Data inicial'), ate: dateField('Data final, inclusive') }),
    async run(input) {
      const { de, ate } = input as { de: string; ate: string };
      const [{ categories, byId }, transactions] = await Promise.all([
        loadCategories(),
        repos.transactions.list({ from: checkDate(de, 'Data inicial'), to: checkDate(ate, 'Data final') }),
      ]);
      const expenses = transactions.filter((t) => t.type === 'expense');
      const incomes = transactions.filter((t) => t.type === 'income');
      const sum = (list: Transaction[]) => list.reduce((s, t) => s + t.amount, 0);

      const byRoot = new Map<string, number>();
      for (const t of expenses) {
        const category = t.categoryId ? byId.get(t.categoryId) : undefined;
        const root = category?.parentId ? byId.get(category.parentId) : category;
        const key = root?.name ?? 'Sem categoria';
        byRoot.set(key, (byRoot.get(key) ?? 0) + t.amount);
      }
      return {
        periodo: { de, ate },
        receitas: money(sum(incomes)),
        despesas: money(sum(expenses)),
        resultado: money(sum(incomes) - sum(expenses)),
        quantidade_lancamentos: expenses.length + incomes.length,
        despesas_por_categoria: [...byRoot.entries()]
          .sort((a, b) => b[1] - a[1])
          .map(([categoria, cents]) => ({ categoria, ...money(cents) })),
        categorias_cadastradas: categories.length,
      };
    },
  };

  const buscarLancamentos: LocalTool = {
    name: 'buscar_lancamentos',
    description:
      'Lista lançamentos de um período, opcionalmente filtrando por texto da descrição, categoria (nome; inclui ' +
      'subcategorias) e tipo. Retorna o total dos encontrados e até 50 linhas, mais recentes primeiro.',
    parameters: objectSchema({
      de: dateField('Data inicial'),
      ate: dateField('Data final, inclusive'),
      texto: { type: 'string', description: 'Trecho da descrição, ou "" para não filtrar.' },
      categoria: { type: 'string', description: 'Nome da categoria, ex. "Alimentação" ou "Mercado", ou "".' },
      tipo: { type: 'string', enum: ['despesa', 'receita', 'transferencia', 'todos'] },
      limite: { type: 'integer', description: 'Máximo de linhas (1 a 50).' },
    }),
    async run(input) {
      const args = input as { de: string; ate: string; texto: string; categoria: string; tipo: string; limite: number };
      const [{ categories, byId }, accounts, transactions] = await Promise.all([
        loadCategories(),
        repos.accounts.list({ includeArchived: true }),
        repos.transactions.list({ from: checkDate(args.de, 'Data inicial'), to: checkDate(args.ate, 'Data final') }),
      ]);
      const ids = matchCategories(args.categoria, categories, byId);
      const text = plain(args.texto);
      const typeMatch: Record<string, (t: Transaction) => boolean> = {
        despesa: (t) => t.type === 'expense',
        receita: (t) => t.type === 'income',
        transferencia: (t) => t.type === 'transfer_in' || t.type === 'transfer_out',
        todos: () => true,
      };
      const matches = transactions.filter(
        (t) =>
          (typeMatch[args.tipo] ?? typeMatch.todos)(t) &&
          (!ids || (t.categoryId !== null && ids.has(t.categoryId))) &&
          (!text || plain(`${t.description} ${t.notes}`).includes(text))
      );
      const accountNames = new Map(accounts.map((a) => [a.id, a.name]));
      const limit = Math.min(MAX_ROWS, Math.max(1, Math.floor(args.limite) || MAX_ROWS));
      return {
        encontrados: matches.length,
        total: money(matches.reduce((s, t) => s + t.amount, 0)),
        lancamentos: matches.slice(0, limit).map((t) => describe(t, byId, accountNames)),
        truncado: matches.length > limit,
      };
    },
  };

  const gastosPorMes: LocalTool = {
    name: 'gastos_por_mes',
    description:
      'Receitas e despesas mês a mês nos últimos N meses (incluindo o mês atual, até hoje), opcionalmente só de ' +
      'uma categoria. Útil para médias, tendências e comparações entre meses.',
    parameters: objectSchema({
      meses: { type: 'integer', description: 'Quantos meses (1 a 24).' },
      categoria: { type: 'string', description: 'Nome da categoria, ou "" para todas.' },
    }),
    async run(input) {
      const args = input as { meses: number; categoria: string };
      const months = Math.min(24, Math.max(1, Math.floor(args.meses) || 1));
      const today = toDateKey(now());
      const current = today.slice(0, 7);
      const first = addMonths(current, -(months - 1));
      const [{ categories, byId }, transactions] = await Promise.all([
        loadCategories(),
        repos.transactions.list({ from: monthRange(first).from, to: today }),
      ]);
      const ids = matchCategories(args.categoria, categories, byId);
      const rows = [];
      for (let i = 0; i < months; i++) {
        const month = addMonths(first, i);
        const inMonth = transactions.filter(
          (t) => t.date.startsWith(month) && (!ids || (t.categoryId !== null && ids.has(t.categoryId)))
        );
        const total = (type: Transaction['type']) =>
          inMonth.filter((t) => t.type === type).reduce((s, t) => s + t.amount, 0);
        rows.push({
          mes: month,
          parcial: month === current,
          despesas: money(total('expense')),
          receitas: money(total('income')),
        });
      }
      return { meses: rows };
    },
  };

  const saldosContas: LocalTool = {
    name: 'saldos_contas',
    description: 'Saldo atual de cada conta (cartões de crédito ficam negativos enquanto há fatura em aberto).',
    parameters: objectSchema({}),
    async run() {
      const today = toDateKey(now());
      const [accounts, balances] = await Promise.all([repos.accounts.list(), repos.accounts.balances(today)]);
      const rows = accounts.map((a) => ({
        conta: a.name,
        tipo: ACCOUNT_TYPE_LABELS[a.type],
        ...money(balances.get(a.id) ?? 0),
      }));
      return { data: today, contas: rows, total: money(rows.reduce((s, r) => s + r.centavos, 0)) };
    },
  };

  const orcamentosDoMes: LocalTool = {
    name: 'orcamentos_do_mes',
    description:
      'Orçamentos por categoria num mês: valor do orçamento, gasto até agora, projeção para o fim do mês e ' +
      'situação (ok, atenção, ameaça de estouro, estourado).',
    parameters: objectSchema({ mes: { type: 'string', description: 'Mês no formato AAAA-MM.' } }),
    async run(input) {
      const { mes } = input as { mes: string };
      if (!/^\d{4}-\d{2}$/.test(mes)) throw new Error('Mês inválido: use AAAA-MM.');
      const today = toDateKey(now());
      const { from, to } = monthRange(mes);
      const reference = fromDateKey(to < today ? to : today < from ? from : today);
      const [{ categories, byId }, budgets, transactions] = await Promise.all([
        loadCategories(),
        repos.budgets.amountsForMonth(mes),
        repos.transactions.list({ from, to, type: 'expense' }),
      ]);
      const grouped = groupByCategoryTree(categories, transactions);
      const levels = { ok: 'ok', warning: 'atenção', projected_overrun: 'ameaça de estouro', exceeded: 'estourado' };
      const rows = [...budgets.entries()].flatMap(([categoryId, budget]) => {
        const category = byId.get(categoryId);
        if (!category) return [];
        const alert = computeMonthlyAlert(
          { categoryId, categoryName: category.name, budget, transactions: grouped.get(categoryId) ?? [] },
          reference
        );
        return [
          {
            categoria: categoryPath(category, byId),
            orcamento: formatCents(budget),
            gasto: formatCents(alert.spentSoFar),
            projecao_fim_do_mes: formatCents(alert.projectedMonthTotal),
            situacao: levels[alert.level],
          },
        ];
      });
      return { mes, orcamentos: rows, observacao: rows.length === 0 ? 'Nenhum orçamento definido.' : undefined };
    },
  };

  const listarCategorias: LocalTool = {
    name: 'listar_categorias',
    description: 'Lista as categorias cadastradas (despesas e receitas), com subcategorias.',
    parameters: objectSchema({}),
    async run() {
      const { categories, byId } = await loadCategories();
      return {
        despesas: categories.filter((c) => c.kind === 'expense').map((c) => categoryPath(c, byId)),
        receitas: categories.filter((c) => c.kind === 'income').map((c) => categoryPath(c, byId)),
      };
    },
  };

  return [resumoPeriodo, buscarLancamentos, gastosPorMes, saldosContas, orcamentosDoMes, listarCategorias];
}

/** System prompt for the assistant; `today` anchors relative dates ("mês passado"). */
export function assistantSystemPrompt(today: Date, webSearch: boolean): string {
  const weekday = today.toLocaleDateString('pt-BR', { weekday: 'long' });
  return [
    'Você é o assistente financeiro pessoal deste app de controle de gastos, no Brasil (valores em R$).',
    `Hoje é ${weekday}, ${toDateKey(today)}.`,
    '',
    'Para qualquer número sobre as finanças da pessoa, consulte as ferramentas: nunca invente nem estime valores',
    'que podem ser buscados. Converta períodos relativos ("últimos 3 meses", "mês passado") em datas exatas.',
    'Se faltar dado (por exemplo, lançamentos sem categoria), diga isso na resposta.',
    '',
    'Responda em português do Brasil, direto ao ponto, com valores no formato R$ 1.234,56. Use listas curtas ou',
    'tabelas quando ajudarem. Quando fizer sentido, termine com uma observação ou sugestão prática.',
    webSearch
      ? 'Você pode buscar na internet informações externas (Selic, CDI, IPCA, cotações, notícias). Nas buscas, ' +
        'nunca inclua dados pessoais da pessoa (valores, nomes, lançamentos). Cite as fontes.'
      : 'Você não tem acesso à internet; se a pergunta exigir dados externos atualizados, diga isso.',
  ].join('\n');
}
