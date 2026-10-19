import { useCallback, useMemo } from 'react';
import { LocalCategorizer, suggestCategory, type CategorySuggestion } from '../ai/categorizer';
import type { CategoryKind } from '../domain/types';
import { useAI } from './AIContext';
import { useQuery } from './useQuery';

const HISTORY_LIMIT = 3000;

/**
 * The category suggester for the current data: an on-device model retrained
 * whenever transactions or categories change, backed by the AI provider when
 * one is configured and AI categorization is enabled.
 */
export function useCategorizer() {
  const { provider, settings } = useAI();
  const { data } = useQuery(
    async (r) => {
      const [categories, history] = await Promise.all([
        r.categories.list(),
        r.transactions.list({ limit: HISTORY_LIMIT }),
      ]);
      return { categories, history: history.filter((t) => t.categoryId !== null) };
    },
    ['transactions', 'categories']
  );

  const local = useMemo(() => (data ? LocalCategorizer.train(data.categories, data.history) : null), [data]);
  const ai = settings.aiCategorization ? provider : null;

  const suggest = useCallback(
    async (description: string, kind: CategoryKind): Promise<CategorySuggestion | null> => {
      if (!data || !local) return null;
      return suggestCategory({ local, ai, categories: data.categories, history: data.history }, { description, kind });
    },
    [data, local, ai]
  );

  return { suggest, ready: !!local, ruleCount: local?.ruleCount ?? 0 };
}
