import { and, asc, eq, inArray, isNull, or } from 'drizzle-orm';
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

function getLive(db: AppDatabase, id: string): Promise<Category | undefined> {
  return db
    .select()
    .from(categories)
    .where(and(eq(categories.id, id), isNull(categories.deletedAt)))
    .get();
}

export function createCategoriesRepository(ctx: RepositoryContext) {
  const { db, bus } = ctx;

  return {
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

        const now = timestamp(ctx);
        const row: Category = {
          id: input.id ?? ctx.newId(),
          parentId: parent?.id ?? null,
          name,
          kind,
          color: input.color ?? parent?.color ?? '#6B7280',
          icon: input.icon ?? parent?.icon ?? 'pricetag-outline',
          isSystem: input.isSystem ?? false,
          sortOrder: input.sortOrder ?? 0,
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
     * Soft-deletes a category together with its subcategories and budgets.
     * Their transactions are kept and go back to "a classificar".
     */
    async remove(id: string): Promise<void> {
      const now = timestamp(ctx);
      await ctx.write(async (tx) => {
        const rows = await tx
          .select({ id: categories.id })
          .from(categories)
          .where(and(or(eq(categories.id, id), eq(categories.parentId, id)), isNull(categories.deletedAt)));
        const ids = rows.map((r) => r.id);
        if (ids.length === 0) return;
        await tx.update(categories).set({ deletedAt: now, updatedAt: now }).where(inArray(categories.id, ids));
        await tx
          .update(budgets)
          .set({ deletedAt: now, updatedAt: now })
          .where(and(inArray(budgets.categoryId, ids), isNull(budgets.deletedAt)));
        await tx
          .update(transactions)
          .set({ categoryId: null, categorySource: null, categoryConfidence: null, updatedAt: now })
          .where(inArray(transactions.categoryId, ids));
      });
      bus.emit('categories', 'budgets', 'transactions');
    },
  };
}

export type CategoriesRepository = ReturnType<typeof createCategoriesRepository>;
