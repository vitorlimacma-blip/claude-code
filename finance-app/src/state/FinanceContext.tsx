import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import * as repo from '../db/repository';
import { computeAllMonthlyAlerts, sortBySeverityDesc } from '../domain/alerts';
import { computeCategoryForecast } from '../domain/forecast';
import type { Category, CategoryMonthlyAlert, Transaction, TransactionType } from '../domain/types';

interface FinanceContextValue {
  loading: boolean;
  categories: Category[];
  transactions: Transaction[];
  alerts: CategoryMonthlyAlert[];
  forecasts: ReturnType<typeof computeCategoryForecast>[];
  refresh: () => Promise<void>;
  addCategory: (input: { name: string; color: string; monthlyBudget: number | null }) => Promise<void>;
  updateCategory: (id: string, input: { name: string; color: string; monthlyBudget: number | null }) => Promise<void>;
  removeCategory: (id: string) => Promise<void>;
  addTransaction: (input: {
    categoryId: string;
    type: TransactionType;
    amount: number;
    date: string;
    note: string;
  }) => Promise<void>;
  removeTransaction: (id: string) => Promise<void>;
}

const FinanceContext = createContext<FinanceContextValue | null>(null);

export function FinanceProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState<Category[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);

  const refresh = useCallback(async () => {
    const [cats, txs] = await Promise.all([repo.listCategories(), repo.listTransactions()]);
    setCategories(cats);
    setTransactions(txs);
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const transactionsByCategory = useMemo(() => repo.groupByCategory(transactions), [transactions]);

  // Recomputed every render (cheap for the data volumes this app targets) so that
  // "today" is always current without fighting the exhaustive-deps lint rule.
  const now = new Date();

  const alerts = sortBySeverityDesc(computeAllMonthlyAlerts(categories, transactionsByCategory, now));

  const forecasts = categories.map((category) =>
    computeCategoryForecast(
      {
        categoryId: category.id,
        categoryName: category.name,
        transactions: transactionsByCategory.get(category.id) ?? [],
      },
      now
    )
  );

  const value: FinanceContextValue = {
    loading,
    categories,
    transactions,
    alerts,
    forecasts,
    refresh,
    addCategory: async (input) => {
      await repo.createCategory(input);
      await refresh();
    },
    updateCategory: async (id, input) => {
      await repo.updateCategory(id, input);
      await refresh();
    },
    removeCategory: async (id) => {
      await repo.deleteCategory(id);
      await refresh();
    },
    addTransaction: async (input) => {
      await repo.createTransaction(input);
      await refresh();
    },
    removeTransaction: async (id) => {
      await repo.deleteTransaction(id);
      await refresh();
    },
  };

  return <FinanceContext.Provider value={value}>{children}</FinanceContext.Provider>;
}

export function useFinance(): FinanceContextValue {
  const ctx = useContext(FinanceContext);
  if (!ctx) throw new Error('useFinance must be used within a FinanceProvider');
  return ctx;
}
