import { buildCategoryTree, groupByCategoryTree } from '../categories';
import { DEFAULT_EXPENSE_CATEGORIES, DEFAULT_INCOME_CATEGORIES } from '../defaultCategories';
import type { Category } from '../types';

function cat(id: string, parentId: string | null = null, sortOrder = 0): Category {
  return {
    id,
    parentId,
    name: id,
    kind: 'expense',
    color: '#000',
    icon: 'pricetag-outline',
    isSystem: false,
    archived: false,
    sortOrder,
    createdAt: '',
    updatedAt: '',
    deletedAt: null,
  };
}

describe('buildCategoryTree', () => {
  it('nests subcategories under parents, ordered, and promotes orphans', () => {
    const tree = buildCategoryTree([cat('b', null, 1), cat('a', null, 0), cat('a2', 'a', 1), cat('a1', 'a', 0), cat('x', 'gone')]);
    expect(tree.map((n) => [n.category.id, n.children.map((c) => c.id)])).toEqual([
      ['a', ['a1', 'a2']],
      ['x', []],
      ['b', []],
    ]);
  });
});

describe('groupByCategoryTree', () => {
  it("puts subcategory items in both their own and their parent's group, skipping uncategorized", () => {
    const categories = [cat('food'), cat('food-market', 'food'), cat('home')];
    const items = [{ categoryId: 'food-market' }, { categoryId: 'food' }, { categoryId: 'home' }, { categoryId: null }];
    const groups = groupByCategoryTree(categories, items);
    expect(groups.get('food')).toHaveLength(2);
    expect(groups.get('food-market')).toHaveLength(1);
    expect(groups.get('home')).toHaveLength(1);
  });
});

describe('default categories', () => {
  const all = [...DEFAULT_EXPENSE_CATEGORIES, ...DEFAULT_INCOME_CATEGORIES];

  it('have unique ids', () => {
    const ids = all.flatMap((c) => [c.id, ...(c.children ?? []).map((ch) => ch.id)]);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('lean default set (briefing §7)', () => {
  it('has 8 to 12 expense categories and at most two levels', () => {
    expect(DEFAULT_EXPENSE_CATEGORIES.length).toBeGreaterThanOrEqual(8);
    expect(DEFAULT_EXPENSE_CATEGORIES.length).toBeLessThanOrEqual(12);
    for (const c of DEFAULT_EXPENSE_CATEGORIES) for (const child of c.children ?? []) expect(child).not.toHaveProperty('children');
  });
});
