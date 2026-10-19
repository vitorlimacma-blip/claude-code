import { and, asc, count, eq, inArray, isNull, or } from 'drizzle-orm';
import type { Category, CategoryKind } from '../../domain/types';
import { type AppDatabase, type RepositoryContext, timestamp, ValidationError } from '../context';
import { budgets, categories, transactions } from '../schema';

export interface NewCategoryInput {
  id?: string;
  name: string;
  /** Required for top-level categories; subcategories always take their parent's kind. */
  kind?: CategoryKind;
  parentId?: string | null;
  /** Defaults to the parent's color, or gray. */
  color?: string;
  /** Defaults to the parent's icon, or a generic tag. */
  icon?: string;
  isSystem?: boolean;
  sortOrder?: number;
}

export type CategoryPatch = Partial<Pick<NewCategoryInput, 'name' | 'color' | 'icon' | 'sortOrder'>>;

/** What a merge or a deletion would touch, shown before the user confirms. */
export interface CategoryUsage {
  transactions: number;
  subcategories: number;
  budgets: number;
}

function getLive(db: AppDatabase, id: string): Promise<Category | undefined> {
  return db
    .select()
    .from(categories)
    .where(and(eq(categories.id, id), isNull(categories.deletedAt)))
    .get();
}

/** The category and its live subcategories. */
async function familyIds(db: AppDatabase, id: string): Promise<string[]> {
  const rows = await db
    .select({ id: categories.id })
    .from(categories)
    .where(and(or(eq(categories.id, id), eq(categories.parentId, id)), isNull(categories.deletedAt)));
  return rows.map((r) => r.id);
}

async function usage(db: AppDatabase, id: string): Promise<CategoryUsage> {
  const ids = await familyIds(db, id);
  if (ids.length === 0) return { transactions: 0, subcategories: 0, budgets: 0 };
  const [tx] = await db
    .select({ n: count() })
    .from(transactions)
    .where(and(inArray(transactions.categoryId, ids), isNull(transactions.deletedAt)));
  const [bd] = await db
    .select({ n: count() })
    .from(budgets)
    .where(and(inArray(budgets.categoryId, ids), isNull(budgets.deletedAt)));
  return { transactions: tx?.n ?? 0, subcategories: ids.length - 1, budgets: bd?.n ?? 0 };
}

export function createCategoriesRepository(ctx: RepositoryContext) {
  const { db, bus } = ctx;

  return {
    /**
     * Live categories, archived ones included (their names are still needed
     * to show old transactions); pickers filter out `archived`.
     */
    async list(options: { kind?: CategoryKind } = {}): Promise<Category[]> {
      return db
        .select()
        .from(categories)
        .where(and(isNull(categories.deletedAt), options.kind ? eq(categories.kind, options.kind) : undefined))
        .orderBy(asc(categories.sortOrder), asc(categories.name));
    },

    async get(id: string): Promise<Category | undefined> {
      return getLive(db, id);
    },

    async create(input: NewCategoryInput): Promise<Category> {
      const name = input.name.trim();
      if (!name) throw new ValidationError('Informe o nome da categoria.');

      const category = await ctx.write(async (tx) => {
        let parent: Category | undefined;
        if (input.parentId) {
          parent = await getLive(tx, input.parentId);
          if (!parent) throw new ValidationError('Categoria-mãe não encontrada.');
          if (parent.parentId) throw new ValidationError('Subcategorias não podem ter subcategorias.');
        }
        const kind = parent?.kind ?? input.kind;
        if (!kind) throw new ValidationError('Informe se a categoria é de despesa ou de receita.');

        const siblings = await tx
          .select({ n: count() })
          .from(categories)
          .where(
            and(
              isNull(categories.deletedAt),
              eq(categories.kind, kind),
              parent ? eq(categories.parentId, parent.id) : isNull(categories.parentId)
            )
          );
        const now = timestamp(ctx);
        const row: Category = {
          id: input.id ?? ctx.newId(),
          parentId: parent?.id ?? null,
          name,
          kind,
          color: input.color ?? parent?.color ?? '#6B7280',
          icon: input.icon ?? parent?.icon ?? 'pricetag-outline',
          isSystem: input.isSystem ?? false,
          archived: false,
          // New categories go to the end of their list.
          sortOrder: input.sortOrder ?? siblings[0]?.n ?? 0,
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
        };
        await tx.insert(categories).values(row);
        return row;
      });
      bus.emit('categories');
      return category;
    },

    async update(id: string, patch: CategoryPatch): Promise<void> {
      if (patch.name !== undefined && patch.name.trim() === '') {
        throw new ValidationError('Informe o nome da categoria.');
      }
      const values = { ...patch, ...(patch.name !== undefined && { name: patch.name.trim() }), updatedAt: timestamp(ctx) };
      await ctx.write((tx) => tx.update(categories).set(values).where(eq(categories.id, id)));
      bus.emit('categories');
    },

    /**
     * Archives (or brings back) a category. Archiving a parent archives its
     * subcategories; bringing back a subcategory also brings back its parent.
     * Transactions and totals are not touched.
     */
    async setArchived(id: string, archived: boolean): Promise<void> {
      await ctx.write(async (tx) => {
        const category = await getLive(tx, id);
        if (!category) throw new ValidationError('Categoria não encontrada.');
        const updatedAt = timestamp(ctx);
        const ids = archived ? await familyIds(tx, id) : [id, ...(category.parentId ? [category.parentId] : [])];
        await tx.update(categories).set({ archived, updatedAt }).where(inArray(categories.id, ids));
      });
      bus.emit('categories');
    },

    /** Moves a category one place up or down among its siblings. */
    async move(id: string, direction: 'up' | 'down'): Promise<void> {
      await ctx.write(async (tx) => {
        const category = await getLive(tx, id);
        if (!category) throw new ValidationError('Categoria não encontrada.');
        const siblings = await tx
          .select()
          .from(categories)
          .where(
            and(
              isNull(categories.deletedAt),
              eq(categories.kind, category.kind),
              category.parentId ? eq(categories.parentId, category.parentId) : isNull(categories.parentId)
            )
          )
          .orderBy(asc(categories.sortOrder), asc(categories.name));
        const index = siblings.findIndex((s) => s.id === id);
        const target = direction === 'up' ? index - 1 : index + 1;
        if (index < 0 || target < 0 || target >= siblings.length) return;
        [siblings[index], siblings[target]] = [siblings[target], siblings[index]];
        const updatedAt = timestamp(ctx);
        // Renumber the whole list so ties from older data can't make a move a no-op.
        for (const [order, s] of siblings.entries()) {
          if (s.sortOrder !== order) {
            await tx.update(categories).set({ sortOrder: order, updatedAt }).where(eq(categories.id, s.id));
          }
        }
      });
      bus.emit('categories');
    },

    /** What deleting or merging this category (with its subcategories) would touch. */
    async usage(id: string): Promise<CategoryUsage> {
      return usage(db, id);
    },

    /**
     * Merges `sourceId` (and its subcategories) into `targetId`: their
     * transactions move to the target, their budgets are dropped (the
     * target's stays) and they are deleted. Callers take a backup first.
     */
    async consolidate(sourceId: string, targetId: string): Promise<CategoryUsage> {
      if (sourceId === targetId) throw new ValidationError('Escolha uma categoria diferente para juntar.');
      const result = await ctx.write(async (tx) => {
        const [source, target] = [await getLive(tx, sourceId), await getLive(tx, targetId)];
        if (!source || !target) throw new ValidationError('Categoria não encontrada.');
        if (source.kind !== target.kind) throw new ValidationError('Só é possível juntar categorias do mesmo tipo (despesa ou receita).');
        if (target.parentId === source.id) {
          throw new ValidationError('Escolha uma categoria fora desta; para manter a subcategoria, junte as outras nela.');
        }
        const ids = await familyIds(tx, sourceId);
        const touched = await usage(tx, sourceId);
        const now = timestamp(ctx);
        await tx
          .update(transactions)
          .set({ categoryId: targetId, updatedAt: now })
          .where(and(inArray(transactions.categoryId, ids), isNull(transactions.deletedAt)));
        await tx
          .update(budgets)
          .set({ deletedAt: now, updatedAt: now })
          .where(and(inArray(budgets.categoryId, ids), isNull(budgets.deletedAt)));
        await tx.update(categories).set({ deletedAt: now, updatedAt: now }).where(inArray(categories.id, ids));
        return touched;
      });
      bus.emit('categories', 'budgets', 'transactions');
      return result;
    },

    /**
     * Deletes a category that was never used (with its subcategories and
     * budgets). A category with transactions can't be deleted: archive it, or
     * merge it into another, so no history loses its category.
     */
    async remove(id: string): Promise<void> {
      const now = timestamp(ctx);
      await ctx.write(async (tx) => {
        const touched = await usage(tx, id);
        if (touched.transactions > 0) {
          throw new ValidationError(
            `Esta categoria tem ${touched.transactions} lançamento(s). Arquive a categoria ou junte com outra para manter o histórico.`
          );
        }
        const ids = await familyIds(tx, id);
        if (ids.length === 0) return;
        await tx.update(categories).set({ deletedAt: now, updatedAt: now }).where(inArray(categories.id, ids));
        await tx
          .update(budgets)
          .set({ deletedAt: now, updatedAt: now })
          .where(and(inArray(budgets.categoryId, ids), isNull(budgets.deletedAt)));
      });
      bus.emit('categories', 'budgets');
    },
  };
}

export type CategoriesRepository = ReturnType<typeof createCategoriesRepository>;
