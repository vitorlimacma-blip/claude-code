import { descriptionTokens, normalizeMerchant } from '../../domain/merchant';
import type { Category, CategoryKind, CategorySource, Transaction } from '../../domain/types';

export interface CategorySuggestion {
  categoryId: string;
  /** 0-1. */
  confidence: number;
  source: Extract<CategorySource, 'rule' | 'local_model' | 'ai'>;
  /** Short pt-BR explanation shown to the user. */
  reason: string;
}

export interface CategorizeInput {
  description: string;
  kind: CategoryKind;
}

interface Rule {
  categoryId: string;
  agreeing: number;
  total: number;
}

type Example = Pick<Transaction, 'description' | 'merchant' | 'categoryId' | 'categorySource' | 'type' | 'updatedAt'>;

const MIN_MODEL_EXAMPLES = 5;

/** "UBER TRIP HELP" -> "UBER TRIP": bank descriptions often append branch or site to the same merchant. */
function prefixKey(merchant: string): string | null {
  const words = merchant.split(' ');
  return words.length >= 2 ? words.slice(0, 2).join(' ') : null;
}
const MIN_MODEL_CONFIDENCE = 0.55;

/**
 * On-device categorizer that learns from the user's own history:
 *
 * 1. Rules: the category the user last chose by hand for the same merchant
 *    (a manual correction always wins).
 * 2. A multinomial Naive Bayes model over description words, trained on every
 *    categorized transaction, with manual choices weighted double.
 *
 * Training is a single pass over the history (milliseconds for years of data),
 * so the model is simply rebuilt whenever transactions change.
 */
export class LocalCategorizer {
  private readonly rules = new Map<string, Rule>();
  /** Same rules keyed by the merchant's first two words, for near matches. */
  private readonly prefixRules = new Map<string, Rule & { updatedAt: string }>();
  private readonly kinds: Map<string, CategoryKind>;
  private readonly tokenCounts = new Map<string, Map<string, number>>(); // category -> token -> weight
  private readonly tokenTotals = new Map<string, number>(); // category -> total token weight
  private readonly docCounts = new Map<string, number>(); // category -> weighted examples
  private readonly vocabulary = new Set<string>();
  private examplesByKind: Record<CategoryKind, number> = { expense: 0, income: 0 };

  private constructor(categories: Category[]) {
    this.kinds = new Map(categories.map((c) => [c.id, c.kind]));
  }

  static train(categories: Category[], history: Example[]): LocalCategorizer {
    const model = new LocalCategorizer(categories);
    const usable = history.filter(
      (t): t is Example & { categoryId: string } =>
        t.categoryId !== null && model.kinds.has(t.categoryId) && (t.type === 'expense' || t.type === 'income')
    );

    // Rules: the latest manual choice per merchant, plus how consistent the history is.
    const byMerchant = new Map<string, (Example & { categoryId: string })[]>();
    for (const t of usable) {
      const merchant = t.merchant ?? normalizeMerchant(t.description);
      if (!merchant) continue;
      const list = byMerchant.get(merchant) ?? [];
      list.push(t);
      byMerchant.set(merchant, list);
    }
    for (const [merchant, list] of byMerchant) {
      const manual = list
        .filter((t) => t.categorySource === 'manual')
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      if (manual.length === 0) continue;
      const categoryId = manual[0].categoryId;
      const rule = { categoryId, agreeing: list.filter((t) => t.categoryId === categoryId).length, total: list.length };
      model.rules.set(merchant, rule);
      const prefix = prefixKey(merchant);
      const existing = prefix ? model.prefixRules.get(prefix) : undefined;
      // Several merchants can share a prefix: the most recent manual choice wins.
      if (prefix && (!existing || existing.updatedAt < manual[0].updatedAt)) {
        model.prefixRules.set(prefix, { ...rule, updatedAt: manual[0].updatedAt });
      }
    }

    // Naive Bayes counts.
    for (const t of usable) {
      const weight = t.categorySource === 'manual' ? 2 : 1;
      const tokens = descriptionTokens(t.description);
      if (tokens.length === 0) continue;
      const counts = model.tokenCounts.get(t.categoryId) ?? new Map<string, number>();
      for (const token of tokens) {
        counts.set(token, (counts.get(token) ?? 0) + weight);
        model.vocabulary.add(token);
      }
      model.tokenCounts.set(t.categoryId, counts);
      model.tokenTotals.set(t.categoryId, (model.tokenTotals.get(t.categoryId) ?? 0) + tokens.length * weight);
      model.docCounts.set(t.categoryId, (model.docCounts.get(t.categoryId) ?? 0) + weight);
      model.examplesByKind[model.kinds.get(t.categoryId)!]++;
    }
    return model;
  }

  /** Number of merchants the user has taught a category for. */
  get ruleCount(): number {
    return this.rules.size;
  }

  predict(input: CategorizeInput): CategorySuggestion | null {
    const merchant = normalizeMerchant(input.description);
    const exact = merchant ? this.rules.get(merchant) : undefined;
    const prefix = merchant ? prefixKey(merchant) : null;
    const near = !exact && prefix ? this.prefixRules.get(prefix) : undefined;
    const rule = exact ?? near;
    if (rule && this.kinds.get(rule.categoryId) === input.kind) {
      const consistent = rule.agreeing === rule.total;
      return {
        categoryId: rule.categoryId,
        // A near match is slightly less certain than the exact same merchant.
        confidence: (consistent ? 0.95 : 0.8) - (exact ? 0 : 0.05),
        source: 'rule',
        reason: 'Você já classificou esse estabelecimento assim.',
      };
    }
    return this.predictWithModel(input);
  }

  private predictWithModel(input: CategorizeInput): CategorySuggestion | null {
    if (this.examplesByKind[input.kind] < MIN_MODEL_EXAMPLES) return null;
    const tokens = descriptionTokens(input.description).filter((t) => this.vocabulary.has(t));
    if (tokens.length === 0) return null;

    const candidates = [...this.docCounts.keys()].filter((id) => this.kinds.get(id) === input.kind);
    const totalDocs = candidates.reduce((sum, id) => sum + this.docCounts.get(id)!, 0);
    const vocabularySize = this.vocabulary.size;

    const logScores = candidates.map((id) => {
      const counts = this.tokenCounts.get(id)!;
      const total = this.tokenTotals.get(id)!;
      let score = Math.log(this.docCounts.get(id)! / totalDocs);
      for (const token of tokens) score += Math.log(((counts.get(token) ?? 0) + 1) / (total + vocabularySize));
      return { id, score };
    });
    const best = Math.max(...logScores.map((s) => s.score));
    const exp = logScores.map((s) => ({ id: s.id, p: Math.exp(s.score - best) }));
    const sum = exp.reduce((acc, s) => acc + s.p, 0);
    const top = exp.reduce((a, b) => (b.p > a.p ? b : a));
    const confidence = top.p / sum;
    if (confidence < MIN_MODEL_CONFIDENCE) return null;
    return {
      categoryId: top.id,
      confidence,
      source: 'local_model',
      reason: 'Parecido com lançamentos que você já classificou.',
    };
  }
}
