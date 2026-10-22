import { rootCategoryIds } from './categories';
import { monthRange } from './dates';
import { expensesByCategory } from './ledger';
import { allOccurrences, reconcile, settledTransactionIds } from './recurrence';
import { typicalSpending, variableRows } from './spending';
import type { AlertLevel, Category, Cents, DateKey, Recurrence, Transaction } from './types';

// Budget per category for the current month, in a neutral tone (briefing §13).
// The month projection is: spent so far + known commitments of the category
// still to come + what a typical month would still add (never the current
// month's daily pace stretched to the end).

export const BUDGET_LEVEL_LABELS: Record<AlertLevel, string> = {
  ok: 'Dentro do previsto',
  warning: 'Perto do limite',
  projected_overrun: 'Pode passar do limite',
  exceeded: 'Acima do limite',
};

export interface BudgetStatus {
  categoryId: string;
  categoryName: string;
  budget: Cents;
  /** Net spending this month up to today (refunds subtracted), subcategories included for a parent. */
  spent: Cents;
  /** Expected bills of this category still unpaid this month, and future-dated expenses. */
  committed: Cents;
  /** What a typical month would still add (0 when this month already reached it). */
  typicalRemaining: Cents;
  /** spent + committed + typicalRemaining. */
  projected: Cents;
  level: AlertLevel;
  /** 'typical' when based on past months; 'none' when there is no history (projection = spent + committed). */
  method: 'typical' | 'none';
}

export interface CategoryMonthProjection {
  categoryId: string;
  categoryName: string;
  spent: Cents;
  committed: Cents;
  /** Median month of past variable spending in this category (null without history). */
  typicalMonth: Cents | null;
  typicalRemaining: Cents;
  projected: Cents;
  method: 'typical' | 'none';
}

interface ProjectionInput {
  categories: Category[];
  /** History of a few months plus the current month (future-dated rows included). */
  transactions: Transaction[];
  recurrences: Recurrence[];
  today: DateKey;
}

/**
 * Builds the month projection for any category (a parent includes its
 * subcategories): spent so far + known commitments still to come + what a
 * typical month would still add. Shared by budgets and Previsões, so both
 * always agree (briefing §9).
 */
function monthProjector({ categories, transactions, recurrences, today }: ProjectionInput) {
  const live = transactions.filter((t) => !t.deletedAt);
  const roots = rootCategoryIds(categories);
  const byId = new Map(categories.map((c) => [c.id, c]));
  const { from: monthStart, to: monthEnd } = monthRange(today.slice(0, 7));

  const settled = settledTransactionIds(recurrences, live, addMonthsBack(monthStart, 4), today);
  const typicalByRoot = typicalSpending(live, settled, today, (id) => (id ? (roots.get(id) ?? id) : null));
  const typicalById = typicalSpending(live, settled, today);

  const monthRows = live.filter((t) => t.date >= monthStart && t.date <= today);
  const spentById = expensesByCategory(monthRows);
  const variableById = new Map<string | null, Cents>();
  for (const r of variableRows(monthRows, settled)) variableById.set(r.categoryId, (variableById.get(r.categoryId) ?? 0) + r.amount);

  // Commitments still to come this month, by category.
  const occurrences = allOccurrences(recurrences, monthStart, monthEnd).filter((o) => o.recurrence.kind === 'expense');
  const matched = reconcile(occurrences, live);
  const committedById = new Map<string | null, Cents>();
  for (const o of occurrences) {
    if (matched.has(o)) continue;
    const id = o.recurrence.categoryId;
    committedById.set(id, (committedById.get(id) ?? 0) + o.recurrence.amount);
  }
  const matchedIds = new Set([...matched.values()].map((t) => t.id));
  for (const t of live) {
    if (t.date > today && t.date <= monthEnd && !matchedIds.has(t.id) && t.nature === 'expense') {
      committedById.set(t.categoryId, (committedById.get(t.categoryId) ?? 0) + t.amount);
    }
  }

  return (categoryId: string): CategoryMonthProjection | null => {
    const category = byId.get(categoryId);
    if (!category) return null;
    const isRoot = !category.parentId;
    const family = (id: string | null) => id !== null && (id === categoryId || (isRoot && roots.get(id) === categoryId));
    const sum = (map: Map<string | null, Cents>) => [...map].filter(([id]) => family(id)).reduce((s, [, v]) => s + v, 0);
    const spent = sum(spentById);
    const committed = sum(committedById);
    const typical = isRoot ? typicalByRoot : typicalById;
    const method = typical.monthly === null ? 'none' : 'typical';
    const typicalMonth = method === 'typical' ? (typical.byKey.get(categoryId) ?? 0) : null;
    const typicalRemaining = typicalMonth !== null ? Math.max(0, typicalMonth - sum(variableById)) : 0;
    return { categoryId, categoryName: category.name, spent, committed, typicalMonth, typicalRemaining, projected: spent + committed + typicalRemaining, method };
  };
}

/** Month projection of every top-level expense category with spending, commitments or a typical month. */
export function categoryProjections(input: ProjectionInput): CategoryMonthProjection[] {
  const project = monthProjector(input);
  return input.categories
    .filter((c) => c.kind === 'expense' && !c.parentId)
    .map((c) => project(c.id))
    .filter((p): p is CategoryMonthProjection => !!p && (p.spent > 0 || p.committed > 0 || (p.typicalMonth ?? 0) > 0))
    .sort((a, b) => b.projected - a.projected);
}

export function budgetStatuses(input: ProjectionInput & { budgets: Map<string, Cents> }): BudgetStatus[] {
  const project = monthProjector(input);
  const statuses: BudgetStatus[] = [];
  for (const [categoryId, budget] of input.budgets) {
    const p = project(categoryId);
    if (!p) continue;
    let level: AlertLevel = 'ok';
    if (p.spent > budget) level = 'exceeded';
    else if (p.projected > budget) level = 'projected_overrun';
    else if (budget > 0 && p.spent >= budget * 0.8) level = 'warning';
    statuses.push({
      categoryId,
      categoryName: p.categoryName,
      budget,
      spent: p.spent,
      committed: p.committed,
      typicalRemaining: p.typicalRemaining,
      projected: p.projected,
      level,
      method: p.method,
    });
  }
  const order: Record<AlertLevel, number> = { exceeded: 3, projected_overrun: 2, warning: 1, ok: 0 };
  return statuses.sort((a, b) => order[b.level] - order[a.level] || b.spent / Math.max(b.budget, 1) - a.spent / Math.max(a.budget, 1));
}

function addMonthsBack(monthStart: DateKey, months: number): DateKey {
  const [y, m] = monthStart.split('-').map(Number);
  const d = new Date(y, m - 1 - months, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}
