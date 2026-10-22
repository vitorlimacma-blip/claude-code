import { and, asc, eq, isNull } from 'drizzle-orm';
import { DEFAULT_CURRENCY, type Cents, type DateKey, type Goal, type Reserve, type ReservePurpose } from '../../domain/types';
import { type RepositoryContext, timestamp, ValidationError } from '../context';
import { goals, reserves } from '../schema';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export interface NewGoalInput {
  id?: string;
  name: string;
  targetAmount: Cents;
  currency?: string;
  deadline?: DateKey | null;
  contributionDates?: DateKey[];
}

export type GoalPatch = Partial<Omit<NewGoalInput, 'id'>> & { archived?: boolean };

export interface NewReserveInput {
  id?: string;
  accountId: string;
  purpose: ReservePurpose;
  goalId?: string | null;
  name: string;
  amount: Cents;
}

function validateGoal(input: GoalPatch) {
  if (input.name !== undefined && input.name.trim() === '') throw new ValidationError('Informe o nome da meta.');
  if (input.targetAmount !== undefined && (!Number.isSafeInteger(input.targetAmount) || input.targetAmount <= 0)) {
    throw new ValidationError('Informe um valor maior que zero.');
  }
  if (input.deadline && !DATE_RE.test(input.deadline)) throw new ValidationError('Data final inválida.');
  if (input.contributionDates && !input.contributionDates.every((d) => DATE_RE.test(d))) {
    throw new ValidationError('Datas de aporte inválidas.');
  }
}

function validateReserve(input: Partial<NewReserveInput>) {
  if (input.name !== undefined && input.name.trim() === '') throw new ValidationError('Informe o nome da reserva.');
  if (input.amount !== undefined && (!Number.isSafeInteger(input.amount) || input.amount < 0)) {
    throw new ValidationError('Informe um valor válido.');
  }
  if (input.purpose === 'goal' && !input.goalId) throw new ValidationError('Escolha a meta desta reserva.');
}

type GoalRow = typeof goals.$inferSelect;

function toGoal(row: GoalRow): Goal {
  let dates: DateKey[] = [];
  try {
    const parsed = JSON.parse(row.contributionDates);
    if (Array.isArray(parsed)) dates = parsed.filter((d): d is string => typeof d === 'string' && DATE_RE.test(d)).sort();
  } catch {
    dates = [];
  }
  return { ...row, contributionDates: dates };
}

/** Savings goals and the reserves that set money aside for them (or for emergencies). */
export function createGoalsRepository(ctx: RepositoryContext) {
  const { db, bus } = ctx;

  return {
    async list(options: { includeArchived?: boolean } = {}): Promise<Goal[]> {
      const rows = await db
        .select()
        .from(goals)
        .where(options.includeArchived ? isNull(goals.deletedAt) : and(isNull(goals.deletedAt), eq(goals.archived, false)))
        .orderBy(asc(goals.deadline), asc(goals.name));
      return rows.map(toGoal);
    },

    async get(id: string): Promise<Goal | undefined> {
      const row = await db.select().from(goals).where(and(eq(goals.id, id), isNull(goals.deletedAt))).get();
      return row ? toGoal(row) : undefined;
    },

    async create(input: NewGoalInput): Promise<Goal> {
      validateGoal(input);
      const now = timestamp(ctx);
      const row: GoalRow = {
        id: input.id ?? ctx.newId(),
        name: input.name.trim(),
        targetAmount: input.targetAmount,
        currency: input.currency ?? DEFAULT_CURRENCY,
        deadline: input.deadline ?? null,
        contributionDates: JSON.stringify([...(input.contributionDates ?? [])].sort()),
        archived: false,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      };
      await ctx.write((tx) => tx.insert(goals).values(row).onConflictDoNothing());
      bus.emit('goals');
      return toGoal(row);
    },

    async update(id: string, patch: GoalPatch): Promise<void> {
      validateGoal(patch);
      const { contributionDates, ...rest } = patch;
      await ctx.write((tx) =>
        tx
          .update(goals)
          .set({
            ...rest,
            ...(rest.name !== undefined && { name: rest.name.trim() }),
            ...(contributionDates && { contributionDates: JSON.stringify([...contributionDates].sort()) }),
            updatedAt: timestamp(ctx),
          })
          .where(eq(goals.id, id))
      );
      bus.emit('goals');
    },

    /** Soft-deletes the goal and its reserves (the money stays in the account, now free). */
    async remove(id: string): Promise<void> {
      const now = timestamp(ctx);
      await ctx.write(async (tx) => {
        await tx.update(goals).set({ deletedAt: now, updatedAt: now }).where(eq(goals.id, id));
        await tx.update(reserves).set({ deletedAt: now, updatedAt: now }).where(and(eq(reserves.goalId, id), isNull(reserves.deletedAt)));
      });
      bus.emit('goals', 'reserves');
    },

    async listReserves(): Promise<Reserve[]> {
      return db.select().from(reserves).where(isNull(reserves.deletedAt)).orderBy(asc(reserves.accountId), asc(reserves.name));
    },

    async createReserve(input: NewReserveInput): Promise<Reserve> {
      validateReserve(input);
      const now = timestamp(ctx);
      const row: Reserve = {
        id: input.id ?? ctx.newId(),
        accountId: input.accountId,
        purpose: input.purpose,
        goalId: input.purpose === 'goal' ? (input.goalId ?? null) : null,
        name: input.name.trim(),
        amount: input.amount,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      };
      await ctx.write((tx) => tx.insert(reserves).values(row).onConflictDoNothing());
      bus.emit('reserves');
      return row;
    },

    async updateReserve(id: string, patch: Partial<Pick<NewReserveInput, 'name' | 'amount' | 'accountId'>>): Promise<void> {
      validateReserve(patch);
      await ctx.write((tx) =>
        tx
          .update(reserves)
          .set({ ...patch, ...(patch.name !== undefined && { name: patch.name.trim() }), updatedAt: timestamp(ctx) })
          .where(eq(reserves.id, id))
      );
      bus.emit('reserves');
    },

    async removeReserve(id: string): Promise<void> {
      const now = timestamp(ctx);
      await ctx.write((tx) => tx.update(reserves).set({ deletedAt: now, updatedAt: now }).where(eq(reserves.id, id)));
      bus.emit('reserves');
    },
  };
}

export type GoalsRepository = ReturnType<typeof createGoalsRepository>;
