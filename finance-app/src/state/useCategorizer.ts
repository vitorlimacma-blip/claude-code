import { useCallback, useMemo } from 'react';
import { LocalCategorizer, suggestCategory, type CategorySuggestion } from '../ai/categorizer';
import { LOCAL_USER_SCOPE } from '../ai/session';
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
      const [categories, history, rules] = await Promise.all([
        r.categories.list(),
        r.transactions.list({ limit: HISTORY_LIMIT }),
        r.memory.list(LOCAL_USER_SCOPE, { type: 'rule_proposal', status: 'confirmed' }),
      ]);
      const confirmed = rules.flatMap((m) => (m.value.kind === 'rule' ? [{ merchant: m.value.merchant, categoryId: m.value.categoryId }] : []));
      return { categories, history: history.filter((t) => t.categoryId !== null), confirmed };
    },
    // Memory changes rebuild the model, so a forgotten rule stops counting right away.
    ['transactions', 'categories', 'memory_items']
  );

  const learn = settings.learnFromCorrections;
  const model = useMemo(() => {
    if (!data) return null;
    // Without learning, the user's own choices don't train the model; archived categories are never suggested.
    const history = learn ? data.history : data.history.filter((t) => t.categorySource !== 'manual');
    const categories = data.categories.filter((c) => !c.archived);
    return { categories, history, local: LocalCategorizer.train(categories, history).withConfirmedRules(data.confirmed) };
  }, [data, learn]);
  const local = model?.local ?? null;
  const ai = settings.aiCategorization ? provider : null;

  const suggest = useCallback(
    async (description: string, kind: CategoryKind): Promise<CategorySuggestion | null> => {
      if (!model) return null;
      return suggestCategory({ local: model.local, ai, categories: model.categories, history: model.history }, { description, kind });
    },
    [model, ai]
  );

  return { suggest, ready: !!local, ruleCount: local?.ruleCount ?? 0, learnedRules: local?.learnedRules() ?? [] };
}
