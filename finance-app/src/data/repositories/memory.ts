import { and, asc, eq } from 'drizzle-orm';
import type { MemoryItem, MemoryReviewStatus, MemoryType, MemoryValue } from '../../domain/types';
import { type RepositoryContext, timestamp, ValidationError } from '../context';
import { memoryItems } from '../schema';

export interface NewMemoryInput {
  id?: string;
  type: MemoryType;
  value: MemoryValue;
  scope: string;
  evidenceRef?: string | null;
}

type Row = typeof memoryItems.$inferSelect;

const MAX_TEXT = 500;

function validate(value: MemoryValue) {
  if (value.kind === 'text' && (!value.text.trim() || value.text.length > MAX_TEXT)) {
    throw new ValidationError(`Escreva a memória em até ${MAX_TEXT} caracteres.`);
  }
  if (value.kind === 'rule' && !value.merchant.trim()) throw new ValidationError('Regra sem estabelecimento.');
  if (value.kind === 'correction' && !value.transactionId) throw new ValidationError('Correção sem lançamento.');
}

function toItem(row: Row): MemoryItem | null {
  try {
    return { ...row, value: JSON.parse(row.value) as MemoryValue };
  } catch {
    return null;
  }
}

/**
 * The assistant's memory, always within one user scope (passed by the caller
 * from the session, never chosen by a model). New items start as proposals;
 * only the person confirms them. Removing deletes the row for good.
 */
export function createMemoryRepository(ctx: RepositoryContext) {
  const { db, bus } = ctx;
  const inScope = (userScope: string, id: string) => and(eq(memoryItems.id, id), eq(memoryItems.userScope, userScope));

  return {
    async list(userScope: string, filter: { type?: MemoryType; status?: MemoryReviewStatus } = {}): Promise<MemoryItem[]> {
      const rows = await db
        .select()
        .from(memoryItems)
        .where(
          and(
            eq(memoryItems.userScope, userScope),
            filter.type ? eq(memoryItems.type, filter.type) : undefined,
            filter.status ? eq(memoryItems.reviewStatus, filter.status) : undefined
          )
        )
        .orderBy(asc(memoryItems.createdAt));
      return rows.map(toItem).filter((i): i is MemoryItem => i !== null);
    },

    /** Creates a proposal: it has no effect until `confirm`. */
    async propose(userScope: string, input: NewMemoryInput): Promise<MemoryItem> {
      validate(input.value);
      const now = timestamp(ctx);
      const row: Row = {
        id: input.id ?? ctx.newId(),
        createdAt: now,
        updatedAt: now,
        userScope,
        type: input.type,
        value: JSON.stringify(input.value),
        scope: input.scope,
        evidenceRef: input.evidenceRef ?? null,
        reviewStatus: 'proposed',
        version: 1,
      };
      await ctx.write((tx) => tx.insert(memoryItems).values(row).onConflictDoNothing());
      bus.emit('memory_items');
      return toItem(row)!;
    },

    /** Only the person confirms; the caller must come from a user action, never from a model. */
    async confirm(userScope: string, id: string): Promise<void> {
      await ctx.write((tx) => tx.update(memoryItems).set({ reviewStatus: 'confirmed', updatedAt: timestamp(ctx) }).where(inScope(userScope, id)));
      bus.emit('memory_items');
    },

    async edit(userScope: string, id: string, value: MemoryValue): Promise<void> {
      validate(value);
      await ctx.write(async (tx) => {
        const current = await tx.select().from(memoryItems).where(inScope(userScope, id)).get();
        if (!current) throw new ValidationError('Memória não encontrada.');
        await tx
          .update(memoryItems)
          .set({ value: JSON.stringify(value), version: current.version + 1, updatedAt: timestamp(ctx) })
          .where(inScope(userScope, id));
      });
      bus.emit('memory_items');
    },

    /** Deletes for good (not a soft delete), so nothing derived from it survives. */
    async remove(userScope: string, id: string): Promise<void> {
      await ctx.write((tx) => tx.delete(memoryItems).where(inScope(userScope, id)));
      bus.emit('memory_items');
    },

    /** Deletes every memory of a user scope. */
    async removeAll(userScope: string): Promise<void> {
      await ctx.write((tx) => tx.delete(memoryItems).where(eq(memoryItems.userScope, userScope)));
      bus.emit('memory_items');
    },
  };
}

export type MemoryRepository = ReturnType<typeof createMemoryRepository>;
