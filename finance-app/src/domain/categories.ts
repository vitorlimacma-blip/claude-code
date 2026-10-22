import type { Category } from './types';

export interface CategoryNode {
  category: Category;
  children: Category[];
}

/**
 * Arranges categories as top-level parents with their subcategories, both
 * ordered by `sortOrder` then name. Subcategories whose parent is missing
 * (e.g. deleted) are promoted to top level so they never disappear.
 */
export function buildCategoryTree(categories: Category[]): CategoryNode[] {
  const byOrder = (a: Category, b: Category) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'pt-BR');
  const ids = new Set(categories.map((c) => c.id));
  const childrenByParent = new Map<string, Category[]>();
  const roots: Category[] = [];

  for (const c of categories) {
    if (c.parentId && ids.has(c.parentId)) {
      const list = childrenByParent.get(c.parentId) ?? [];
      list.push(c);
      childrenByParent.set(c.parentId, list);
    } else {
      roots.push(c);
    }
  }

  return roots.sort(byOrder).map((category) => ({
    category,
    children: (childrenByParent.get(category.id) ?? []).sort(byOrder),
  }));
}

/** Maps every category id to its top-level ancestor id (a top-level category maps to itself). */
export function rootCategoryIds(categories: Category[]): Map<string, string> {
  const byId = new Map(categories.map((c) => [c.id, c]));
  const result = new Map<string, string>();
  for (const c of categories) {
    const parent = c.parentId ? byId.get(c.parentId) : undefined;
    result.set(c.id, parent ? parent.id : c.id);
  }
  return result;
}

/**
 * Groups items by category so that a parent category's group also contains
 * its subcategories' items. Used for budgets and forecasts, where "Alimentação"
 * should include "Mercado" and "Restaurantes".
 */
export function groupByCategoryTree<T extends { categoryId: string | null }>(
  categories: Category[],
  items: T[]
): Map<string, T[]> {
  const roots = rootCategoryIds(categories);
  const groups = new Map<string, T[]>();
  const push = (key: string, item: T) => {
    const list = groups.get(key);
    if (list) list.push(item);
    else groups.set(key, [item]);
  };

  for (const item of items) {
    if (!item.categoryId) continue;
    push(item.categoryId, item);
    const root = roots.get(item.categoryId);
    if (root && root !== item.categoryId) push(root, item);
  }
  return groups;
}
