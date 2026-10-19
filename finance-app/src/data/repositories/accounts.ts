import { and, asc, eq, isNull, lte, sql } from 'drizzle-orm';
import type { Account, AccountType, Cents, DateKey } from '../../domain/types';
import { type RepositoryContext, timestamp, ValidationError } from '../context';
import { accounts, transactions } from '../schema';

export interface NewAccountInput {
  id?: string;
  name: string;
  type: AccountType;
  institution?: string | null;
  color?: string;
  initialBalance?: Cents;
  creditLimit?: Cents | null;
  closingDay?: number | null;
  dueDay?: number | null;
  sortOrder?: number;
}

export type AccountPatch = Partial<Omit<NewAccountInput, 'id'>> & { archived?: boolean };

const DEFAULT_COLOR = '#6B7280';

function validateDay(value: number | null | undefined, label: string) {
  if (value == null) return;
  if (!Number.isInteger(value) || value < 1 || value > 31) {
    throw new ValidationError(`${label} deve ser um dia entre 1 e 31.`);
  }
}

function validate(input: AccountPatch) {
  if (input.name !== undefined && input.name.trim() === '') throw new ValidationError('Informe o nome da conta.');
  validateDay(input.closingDay, 'Dia de fechamento');
  validateDay(input.dueDay, 'Dia de vencimento');
}

export function createAccountsRepository(ctx: RepositoryContext) {
  const { db, bus } = ctx;

  return {
    async list(options: { includeArchived?: boolean } = {}): Promise<Account[]> {
      return db
        .select()
        .from(accounts)
        .where(and(isNull(accounts.deletedAt), options.includeArchived ? undefined : eq(accounts.archived, false)))
        .orderBy(asc(accounts.sortOrder), asc(accounts.name));
    },

    async get(id: string): Promise<Account | undefined> {
      return db
        .select()
        .from(accounts)
        .where(and(eq(accounts.id, id), isNull(accounts.deletedAt)))
        .get();
    },

    async create(input: NewAccountInput): Promise<Account> {
      validate(input);
      const now = timestamp(ctx);
      const isCard = input.type === 'credit_card';
      const account: Account = {
        id: input.id ?? ctx.newId(),
        name: input.name.trim(),
        type: input.type,
        institution: input.institution ?? null,
        color: input.color ?? DEFAULT_COLOR,
        initialBalance: input.initialBalance ?? 0,
        creditLimit: isCard ? (input.creditLimit ?? null) : null,
        closingDay: isCard ? (input.closingDay ?? null) : null,
        dueDay: isCard ? (input.dueDay ?? null) : null,
        archived: false,
        sortOrder: input.sortOrder ?? 0,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      };
      await ctx.write((tx) => tx.insert(accounts).values(account));
      bus.emit('accounts');
      return account;
    },

    async update(id: string, patch: AccountPatch): Promise<void> {
      validate(patch);
      const values = { ...patch, ...(patch.name !== undefined && { name: patch.name.trim() }), updatedAt: timestamp(ctx) };
      await ctx.write((tx) => tx.update(accounts).set(values).where(eq(accounts.id, id)));
      bus.emit('accounts');
    },

    /**
     * Soft-deletes an account. Accounts with transactions can't be removed
     * (their history would be orphaned); archive them instead.
     */
    async remove(id: string): Promise<void> {
      const now = timestamp(ctx);
      await ctx.write(async (tx) => {
        const used = await tx
          .select({ n: sql<number>`count(*)` })
          .from(transactions)
          .where(and(eq(transactions.accountId, id), isNull(transactions.deletedAt)))
          .get();
        if (used && used.n > 0) {
          throw new ValidationError('Esta conta tem lançamentos. Arquive a conta em vez de excluí-la.');
        }
        await tx.update(accounts).set({ deletedAt: now, updatedAt: now }).where(eq(accounts.id, id));
      });
      bus.emit('accounts');
    },

    /**
     * Balance of every live account as of `asOf` (inclusive): initial balance
     * plus incomes and incoming transfers, minus expenses and outgoing transfers.
     * Credit cards end up negative while there is an open invoice.
     */
    async balances(asOf: DateKey): Promise<Map<string, Cents>> {
      const rows = await db
        .select({
          id: accounts.id,
          initial: accounts.initialBalance,
          movement: sql<number>`coalesce(sum(case
            when ${transactions.type} in ('income', 'transfer_in') then ${transactions.amount}
            else -${transactions.amount} end), 0)`,
        })
        .from(accounts)
        .leftJoin(
          transactions,
          and(eq(transactions.accountId, accounts.id), isNull(transactions.deletedAt), lte(transactions.date, asOf))
        )
        .where(isNull(accounts.deletedAt))
        .groupBy(accounts.id);
      return new Map(rows.map((r) => [r.id, r.initial + r.movement]));
    },
  };
}

export type AccountsRepository = ReturnType<typeof createAccountsRepository>;
