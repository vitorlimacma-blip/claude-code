import type { Category, CategoryKind, Transaction } from '../../domain/types';
import type { AIProvider } from '../types';
import { LocalCategorizer, type CategorizeInput, type CategorySuggestion } from './localModel';

export { LocalCategorizer, type CategorySuggestion } from './localModel';

/** Local suggestions at or above this confidence are used without asking the AI. */
const LOCAL_CONFIDENT = 0.75;
const MAX_EXAMPLES = 40;
const NONE = 'nenhuma';

export interface SuggestDeps {
  local: LocalCategorizer;
  /** Null when AI is off, has no key, or AI categorization is disabled. */
  ai: AIProvider | null;
  categories: Category[];
  /** Recent categorized transactions, newest first, used as few-shot examples. */
  history: Pick<Transaction, 'description' | 'categoryId' | 'categorySource' | 'type'>[];
}

/** "Alimentação › Mercado" style label for a category. */
export function categoryPath(category: Category, byId: Map<string, Category>): string {
  const parent = category.parentId ? byId.get(category.parentId) : undefined;
  return parent ? `${parent.name} › ${category.name}` : category.name;
}

/**
 * Suggests a category: the on-device learner first (instant, free, offline),
 * then the AI provider when the learner isn't confident. Never throws for AI
 * failures: without AI the local suggestion (or none) is returned.
 */
export async function suggestCategory(deps: SuggestDeps, input: CategorizeInput): Promise<CategorySuggestion | null> {
  if (input.description.trim().length < 2) return null;
  const local = deps.local.predict(input);
  if (local && local.confidence >= LOCAL_CONFIDENT) return local;
  if (!deps.ai) return local;
  try {
    return (await categorizeWithAI(deps.ai, deps.categories, deps.history, input)) ?? local;
  } catch {
    return local;
  }
}

async function categorizeWithAI(
  ai: AIProvider,
  categories: Category[],
  history: SuggestDeps['history'],
  input: CategorizeInput
): Promise<CategorySuggestion | null> {
  const byId = new Map(categories.map((c) => [c.id, c]));
  const options = categories.filter((c) => c.kind === input.kind);
  if (options.length === 0) return null;

  const examples = history
    .filter((t) => t.categoryId && byId.get(t.categoryId)?.kind === input.kind && t.description.trim())
    // Manual choices first: they are what the user actually decided.
    .sort((a, b) => Number(b.categorySource === 'manual') - Number(a.categorySource === 'manual'))
    .slice(0, MAX_EXAMPLES)
    .map((t) => `- "${t.description}" → ${categoryPath(byId.get(t.categoryId!)!, byId)}`);

  const kindLabel: Record<CategoryKind, string> = { expense: 'despesa', income: 'receita' };
  const prompt = [
    `Classifique este lançamento (${kindLabel[input.kind]}) de uma pessoa no Brasil:`,
    `"${input.description}"`,
    '',
    'Categorias possíveis (id | nome):',
    ...options.map((c) => `${c.id} | ${categoryPath(c, byId)}`),
    '',
    examples.length > 0
      ? `Exemplos de como esta pessoa costuma classificar:\n${examples.join('\n')}`
      : 'Ainda não há exemplos desta pessoa.',
    '',
    `Prefira a subcategoria mais específica que se encaixe. Se não der para saber, use "${NONE}".`,
  ].join('\n');

  const answer = await ai.generateJson<{ categoryId: string; confidence: number }>({
    tier: 'fast',
    system:
      'Você categoriza lançamentos financeiros pessoais no Brasil (Pix, boleto, cartão, nomes de estabelecimentos ' +
      'como aparecem em extratos). Siga o padrão de classificação da própria pessoa quando houver exemplos.',
    prompt,
    schemaName: 'categoria',
    schema: {
      type: 'object',
      properties: {
        categoryId: { type: 'string', enum: [...options.map((c) => c.id), NONE] },
        confidence: { type: 'number', description: 'De 0 a 1: quão certo você está.' },
      },
      required: ['categoryId', 'confidence'],
      additionalProperties: false,
    },
  });

  if (answer.categoryId === NONE || !byId.has(answer.categoryId)) return null;
  return {
    categoryId: answer.categoryId,
    confidence: Math.min(1, Math.max(0, Number(answer.confidence) || 0)),
    source: 'ai',
    reason: 'Sugerido pela IA.',
  };
}
