import { DEFAULT_EXPENSE_CATEGORIES, DEFAULT_INCOME_CATEGORIES } from '../../domain/defaultCategories';
import { isIconName } from '../icons';

describe('icons', () => {
  it('every default category icon has a Lucide equivalent', () => {
    const all = [...DEFAULT_EXPENSE_CATEGORIES, ...DEFAULT_INCOME_CATEGORIES];
    const icons = all.flatMap((c) => [c.icon, ...(c.children ?? []).flatMap((ch) => (ch.icon ? [ch.icon] : []))]);
    expect(icons.filter((icon) => !isIconName(icon))).toEqual([]);
  });
});
