import { rootCategoryIds } from './categories';
import { addDaysToDateKey, addMonths, dayOfMonthKey, daysInMonth, formatDateBR, formatMonthBR } from './dates';
import { expensesByCategory, resultEffect } from './ledger';
import { formatCents } from './money';
import type { CashProjection } from './projection';
import type { BudgetStatus } from './budgets';
import type { Category, Cents, DateKey, Transaction } from './types';

// Comparisons between equivalent periods and a few actionable observations
// (briefing §7, §10). Every insight carries its basis; none is shown without data.

export interface EquivalentComparison {
  /** "1 a 19 de outubro" vs "1 a 19 de setembro". */
  current: { from: DateKey; to: DateKey; spent: Cents };
  previous: { from: DateKey; to: DateKey; spent: Cents };
  /** Net spending per top-level category in each period. */
  byRoot: { categoryId: string | null; current: Cents; previous: Cents }[];
  /** True when the previous period has data (otherwise there is nothing to compare). */
  comparable: boolean;
}

/**
 * Spending so far this month versus the same days of last month, never versus
 * the whole previous month (§10: compare equivalent periods).
 */
export function compareEquivalentPeriods(transactions: Transaction[], categories: Category[], today: DateKey): EquivalentComparison {
  const month = today.slice(0, 7);
  const prev = addMonths(month, -1);
  const day = Number(today.slice(8, 10));
  const [py, pm] = prev.split('-').map(Number);
  const prevTo = dayOfMonthKey(prev, Math.min(day, daysInMonth(py, pm - 1)));
  const live = transactions.filter((t) => !t.deletedAt);
  const cur = live.filter((t) => t.date >= `${month}-01` && t.date <= today);
  const old = live.filter((t) => t.date >= `${prev}-01` && t.date <= prevTo);
  const roots = rootCategoryIds(categories);
  const byRoot = new Map<string | null, { current: Cents; previous: Cents }>();
  const add = (map: Map<string | null, Cents>, key: 'current' | 'previous') => {
    for (const [id, v] of map) {
      const root = id ? (roots.get(id) ?? id) : null;
      const entry = byRoot.get(root) ?? { current: 0, previous: 0 };
      entry[key] += v;
      byRoot.set(root, entry);
    }
  };
  const curByCat = expensesByCategory(cur);
  const oldByCat = expensesByCategory(old);
  add(curByCat, 'current');
  add(oldByCat, 'previous');
  const total = (m: Map<string | null, Cents>) => [...m.values()].reduce((s, v) => s + v, 0);
  const firstDate = live.reduce<DateKey | null>((min, t) => (min === null || t.date < min ? t.date : min), null);
  return {
    current: { from: `${month}-01`, to: today, spent: total(curByCat) },
    previous: { from: `${prev}-01`, to: prevTo, spent: total(oldByCat) },
    byRoot: [...byRoot].map(([categoryId, v]) => ({ categoryId, ...v })),
    comparable: firstDate !== null && firstDate <= `${prev}-01`,
  };
}

export interface Insight {
  id: string;
  title: string;
  body: string;
  basis: string;
  tone: 'neutral' | 'attention';
  icon: string;
  action?: { label: string; target: 'transactions' | 'recurrences' | 'categories'; categoryId?: string };
}

const MIN_INCREASE: Cents = 10000; // R$ 100

/** At most three observations, the most useful first. Nothing is produced without the data behind it. */
export function buildInsights(input: {
  today: DateKey;
  projection: CashProjection | null;
  budgets: BudgetStatus[];
  comparison: EquivalentComparison;
  categories: Category[];
  monthTransactions: Transaction[];
}): Insight[] {
  const { today, projection, budgets, comparison, categories, monthTransactions } = input;
  const out: Insight[] = [];
  const names = new Map(categories.map((c) => [c.id, c.name]));

  if (projection && projection.status !== 'unavailable' && projection.lowest.amount < 0) {
    out.push({
      id: 'low-balance',
      title: 'O saldo pode ficar negativo antes do recebimento',
      body: `Pela previsão, o saldo disponível chega a ${formatCents(projection.lowest.amount)} em ${formatDateBR(projection.lowest.date)}.`,
      basis: 'Base: saldo atual, contas previstas, faturas e gasto variável típico (veja “Como calculamos”).',
      tone: 'attention',
      icon: 'alert-outline',
      action: { label: 'Ver contas previstas', target: 'recurrences' },
    });
  }

  const soon = projection?.outflows.find((e) => e.date >= today && e.date <= addDaysToDateKey(today, 3) && !e.overdue);
  if (soon) {
    out.push({
      id: `soon-${soon.label}`,
      title: `${soon.label} vence ${soon.date === today ? 'hoje' : `em ${formatDateBR(soon.date)}`}`,
      body: `Valor previsto: ${formatCents(-soon.amount)}. Quando pagar, registre o lançamento para ele sair dos compromissos.`,
      basis: soon.source === 'invoice' ? 'Base: compras registradas nessa fatura menos pagamentos.' : 'Base: suas contas previstas.',
      tone: 'neutral',
      icon: 'calendar-outline',
      action: { label: 'Ver contas previstas', target: 'recurrences' },
    });
  }

  if (comparison.comparable) {
    const rising = comparison.byRoot
      .filter((r) => r.categoryId && r.current - r.previous >= MIN_INCREASE && r.current >= r.previous * 1.3)
      .sort((a, b) => b.current - b.previous - (a.current - a.previous))[0];
    if (rising?.categoryId) {
      const name = names.get(rising.categoryId) ?? 'Uma categoria';
      out.push({
        id: `rising-${rising.categoryId}`,
        title: `${name}: ${formatCents(rising.current - rising.previous)} a mais que no mesmo período`,
        body: `Até ${formatDateBR(comparison.current.to)}: ${formatCents(rising.current)}. Em ${formatDateBR(comparison.previous.from)} a ${formatDateBR(comparison.previous.to)}: ${formatCents(rising.previous)}.`,
        basis: 'Base: mesmos dias do mês anterior, sem contar transferências e já descontando estornos.',
        tone: 'neutral',
        icon: 'trending-up-outline',
        action: { label: 'Ver lançamentos', target: 'transactions', categoryId: rising.categoryId },
      });
    }
  }

  const over = budgets.find((b) => b.level === 'projected_overrun');
  if (over && out.length < 3) {
    out.push({
      id: `budget-${over.categoryId}`,
      title: `${over.categoryName} pode passar do orçamento`,
      body: `Gasto até agora ${formatCents(over.spent)} de ${formatCents(over.budget)}; previsão para o mês ${formatCents(over.projected)}.`,
      basis: over.method === 'typical' ? 'Base: gasto até hoje, contas previstas e o restante de um mês típico.' : 'Base: gasto até hoje e contas previstas (sem histórico para estimar o resto).',
      tone: 'neutral',
      icon: 'information-circle-outline',
      action: { label: 'Ver lançamentos', target: 'transactions', categoryId: over.categoryId },
    });
  }

  const uncategorized = monthTransactions.filter((t) => !t.deletedAt && t.categoryId === null && (resultEffect(t) === 'expense' || resultEffect(t) === 'income')).length;
  if (uncategorized > 0) {
    out.push({
      id: 'uncategorized',
      title: `${uncategorized} lançamento(s) deste mês sem categoria`,
      body: 'Categorizar deixa os orçamentos e as comparações mais certos.',
      basis: `Base: lançamentos de ${formatMonthBR(today.slice(0, 7))} até hoje.`,
      tone: 'neutral',
      icon: 'pricetag-outline',
      action: { label: 'Revisar', target: 'transactions' },
    });
  }
  return out.slice(0, 3);
}
