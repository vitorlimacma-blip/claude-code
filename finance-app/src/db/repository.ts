import { getDb } from './client';
import type { Category, Transaction, TransactionType } from '../domain/types';

interface CategoryRow {
  id: string;
  name: string;
  color: string;
  monthly_budget: number | null;
  created_at: string;
}

interface TransactionRow {
  id: string;
  category_id: string;
  type: TransactionType;
  amount: number;
  date: string;
  note: string;
  created_at: string;
}

function rowToCategory(row: CategoryRow): Category {
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    monthlyBudget: row.monthly_budget,
    createdAt: row.created_at,
  };
}

function rowToTransaction(row: TransactionRow): Transaction {
  return {
    id: row.id,
    categoryId: row.category_id,
    type: row.type,
    amount: row.amount,
    date: row.date,
    note: row.note,
    createdAt: row.created_at,
  };
}

function generateId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export async function listCategories(): Promise<Category[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<CategoryRow>('SELECT * FROM categories ORDER BY name COLLATE NOCASE ASC');
  return rows.map(rowToCategory);
}

export async function createCategory(input: {
  name: string;
  color: string;
  monthlyBudget: number | null;
}): Promise<Category> {
  const db = await getDb();
  const category: Category = {
    id: generateId(),
    name: input.name,
    color: input.color,
    monthlyBudget: input.monthlyBudget,
    createdAt: new Date().toISOString(),
  };
  await db.runAsync(
    'INSERT INTO categories (id, name, color, monthly_budget, created_at) VALUES (?, ?, ?, ?, ?)',
    category.id,
    category.name,
    category.color,
    category.monthlyBudget,
    category.createdAt
  );
  return category;
}

export async function updateCategory(
  id: string,
  input: { name: string; color: string; monthlyBudget: number | null }
): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    'UPDATE categories SET name = ?, color = ?, monthly_budget = ? WHERE id = ?',
    input.name,
    input.color,
    input.monthlyBudget,
    id
  );
}

export async function deleteCategory(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM categories WHERE id = ?', id);
}

export async function listTransactions(): Promise<Transaction[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<TransactionRow>('SELECT * FROM transactions ORDER BY date DESC, created_at DESC');
  return rows.map(rowToTransaction);
}

export async function createTransaction(input: {
  categoryId: string;
  type: TransactionType;
  amount: number;
  date: string;
  note: string;
}): Promise<Transaction> {
  const db = await getDb();
  const transaction: Transaction = {
    id: generateId(),
    categoryId: input.categoryId,
    type: input.type,
    amount: input.amount,
    date: input.date,
    note: input.note,
    createdAt: new Date().toISOString(),
  };
  await db.runAsync(
    'INSERT INTO transactions (id, category_id, type, amount, date, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    transaction.id,
    transaction.categoryId,
    transaction.type,
    transaction.amount,
    transaction.date,
    transaction.note,
    transaction.createdAt
  );
  return transaction;
}

export async function deleteTransaction(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM transactions WHERE id = ?', id);
}

/** Groups a flat transaction list by category id, for forecast/alert calculations. */
export function groupByCategory(transactions: Transaction[]): Map<string, Transaction[]> {
  const map = new Map<string, Transaction[]>();
  for (const t of transactions) {
    const list = map.get(t.categoryId);
    if (list) {
      list.push(t);
    } else {
      map.set(t.categoryId, [t]);
    }
  }
  return map;
}
