import { and, asc, eq, isNull } from 'drizzle-orm';
import type { Cents, DateKey, PaymentMethod, Recurrence, RecurrenceFrequency } from '../../domain/types';
import { type RepositoryContext, timestamp, ValidationError } from '../context';
import { recurrences } from '../schema';

export interface NewRecurrenceInput {
  id?: string;
  kind: 'expense' | 'income';
  description: string;
  amount: Cents;
  accountId: string;
  categoryId?: string | null;
  paymentMethod?: PaymentMethod;
  frequency?: RecurrenceFrequency;
  dayOfMonth: number;
  monthOfYear?: number | null;
  startDate: DateKey;
  endDate?: DateKey | null;
}

export type RecurrencePatch = Partial<Omit<NewRecurrenceInput, 'id'>>;

function validate(input: RecurrencePatch) {
  if (input.description !== undefined && input.description.trim() === '') throw new ValidationError('Informe a descrição.');
  if (input.amount !== undefined && (!Number.isInteger(input.amount) || input.amount <= 0)) {
    throw new ValidationError('Informe um valor maior que zero.');
  }
  if (input.dayOfMonth !== undefined && (!Number.isInteger(input.dayOfMonth) || input.dayOfMonth < 1 || input.dayOfMonth > 31)) {
    throw new ValidationError('O dia deve ser entre 1 e 31.');
  }
  if (input.frequency === 'yearly' && (!input.monthOfYear || input.monthOfYear < 1 || input.monthOfYear > 12)) {
    throw new ValidationError('Informe o mês em que a conta anual vence.');
  }
  if (input.endDate && input.startDate && input.endDate < input.startDate) {
    throw new ValidationError('A data final vem antes da inicial.');
  }
}

/** Expected bills and incomes ("Contas previstas"). */
export function createRecurrencesRepository(ctx: RepositoryContext) {
  const { db, bus } = ctx;

  return {
    async list(): Promise<Recurrence[]> {
      return db.select().from(recurrences).where(isNull(recurrences.deletedAt)).orderBy(asc(recurrences.kind), asc(recurrences.dayOfMonth));
    },

    async get(id: string): Promise<Recurrence | undefined> {
      return db.select().from(recurrences).where(and(eq(recurrences.id, id), isNull(recurrences.deletedAt))).get();
    },

    async create(input: NewRecurrenceInput): Promise<Recurrence> {
      validate(input);
      const now = timestamp(ctx);
      const row: Recurrence = {
        id: input.id ?? ctx.newId(),
        kind: input.kind,
        description: input.description.trim(),
        amount: input.amount,
        accountId: input.accountId,
        categoryId: input.categoryId ?? null,
        paymentMethod: input.paymentMethod ?? 'other',
        frequency: input.frequency ?? 'monthly',
        dayOfMonth: input.dayOfMonth,
        monthOfYear: input.frequency === 'yearly' ? (input.monthOfYear ?? null) : null,
        startDate: input.startDate,
        endDate: input.endDate ?? null,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      };
      await ctx.write((tx) => tx.insert(recurrences).values(row).onConflictDoNothing());
      bus.emit('recurrences');
      return row;
    },

    async update(id: string, patch: RecurrencePatch): Promise<void> {
      validate(patch);
      const values = {
        ...patch,
        ...(patch.description !== undefined && { description: patch.description.trim() }),
        ...(patch.frequency === 'monthly' && { monthOfYear: null }),
        updatedAt: timestamp(ctx),
      };
      await ctx.write((tx) => tx.update(recurrences).set(values).where(eq(recurrences.id, id)));
      bus.emit('recurrences');
    },

    /** Soft-deletes; transactions that settled it keep their link and stay as they are. */
    async remove(id: string): Promise<void> {
      const now = timestamp(ctx);
      await ctx.write((tx) => tx.update(recurrences).set({ deletedAt: now, updatedAt: now }).where(eq(recurrences.id, id)));
      bus.emit('recurrences');
    },

    async restore(id: string): Promise<void> {
      await ctx.write((tx) => tx.update(recurrences).set({ deletedAt: null, updatedAt: timestamp(ctx) }).where(eq(recurrences.id, id)));
      bus.emit('recurrences');
    },
  };
}

export type RecurrencesRepository = ReturnType<typeof createRecurrencesRepository>;
