import { DEFAULT_EXPENSE_CATEGORIES, DEFAULT_INCOME_CATEGORIES } from '../../domain/defaultCategories';
import type { Category, Transaction } from '../../domain/types';
import { LocalCategorizer, suggestCategory } from '../categorizer';
import type { AIProvider, JsonRequest } from '../types';

const sync = { createdAt: '', updatedAt: '', deletedAt: null };
const categories: Category[] = [...DEFAULT_EXPENSE_CATEGORIES, ...DEFAULT_INCOME_CATEGORIES].flatMap((p) => {
  const kind = DEFAULT_INCOME_CATEGORIES.includes(p) ? ('income' as const) : ('expense' as const);
  return [
    { ...sync, id: p.id, parentId: null, name: p.name, kind, color: p.color, icon: p.icon, isSystem: true, archived: false, sortOrder: 0 },
    ...(p.children ?? []).map((c) => ({
      ...sync,
      id: c.id,
      parentId: p.id,
      name: c.name,
      kind,
      color: p.color,
      icon: p.icon,
      isSystem: true,
      archived: false,
      sortOrder: 0,
    })),
  ];
});

let clock = 0;
function tx(description: string, categoryId: string, categorySource: Transaction['categorySource'] = 'manual', type: Transaction['type'] = 'expense') {
  clock++;
  return { description, merchant: null, categoryId, categorySource, type, updatedAt: `2026-01-01T00:00:${String(clock).padStart(2, '0')}Z` };
}

describe('LocalCategorizer', () => {
  it('learns a rule from manual choices, and the latest correction wins', () => {
    const model = LocalCategorizer.train(categories, [
      tx('IFD*IFOOD 01/02', 'sys-alimentacao-restaurantes'),
      tx('IFOOD', 'sys-alimentacao-delivery'), // later correction
    ]);
    const s = model.predict({ description: 'ifood 12/03', kind: 'expense' });
    expect(s).toMatchObject({ categoryId: 'sys-alimentacao-delivery', source: 'rule', confidence: 0.8 });
    expect(model.ruleCount).toBe(1);
  });

  it('applies a rule to the same merchant with extra trailing words', () => {
    const model = LocalCategorizer.train(categories, [tx('UBER *TRIP', 'sys-lazer')]);
    const near = model.predict({ description: 'UBER *TRIP HELP.UBER.COM', kind: 'expense' });
    expect(near).toMatchObject({ categoryId: 'sys-lazer', source: 'rule' });
    expect(near?.confidence).toBeCloseTo(0.9);
    // A single shared word is not enough.
    expect(model.predict({ description: 'UBER EATS', kind: 'expense' })).toBeNull();
  });

  it('does not turn AI-only categorizations into rules', () => {
    const model = LocalCategorizer.train(categories, [tx('NETFLIX', 'sys-assinaturas-streaming', 'ai')]);
    expect(model.predict({ description: 'NETFLIX.COM', kind: 'expense' })).toBeNull();
  });

  it('generalizes from words once there is enough history', () => {
    const model = LocalCategorizer.train(categories, [
      tx('Posto Shell Av Brasil', 'sys-transporte-combustivel'),
      tx('Posto Ipiranga Centro', 'sys-transporte-combustivel'),
      tx('Auto Posto Petrobras', 'sys-transporte-combustivel'),
      tx('Supermercado Extra', 'sys-alimentacao-mercado'),
      tx('Supermercado Pao de Acucar', 'sys-alimentacao-mercado'),
      tx('Farmacia Drogasil', 'sys-saude-farmacia'),
    ]);
    expect(model.predict({ description: 'POSTO ALE RODOVIA', kind: 'expense' })).toMatchObject({
      categoryId: 'sys-transporte-combustivel',
      source: 'local_model',
    });
    // Never suggests a category of the wrong kind.
    expect(model.predict({ description: 'POSTO ALE', kind: 'income' })).toBeNull();
  });
});

function fakeAI(answer: object | Error): AIProvider & { requests: JsonRequest[] } {
  const requests: JsonRequest[] = [];
  return {
    id: 'claude',
    requests,
    async generateJson<T>(request: JsonRequest) {
      requests.push(request);
      if (answer instanceof Error) throw answer;
      return answer as T;
    },
    async runAgent() {
      throw new Error('not used');
    },
  };
}

describe('suggestCategory', () => {
  const history = [tx('Feira do Seu Zé', 'sys-alimentacao-mercado')];
  const local = LocalCategorizer.train(categories, history);

  it('uses a confident local rule without calling the AI', async () => {
    const ai = fakeAI({ categoryId: 'sys-outros', confidence: 1 });
    const s = await suggestCategory({ local, ai, categories, history }, { description: 'FEIRA DO SEU ZE', kind: 'expense' });
    expect(s?.source).toBe('rule');
    expect(ai.requests).toHaveLength(0);
  });

  it('asks the AI with valid category ids and the user examples', async () => {
    const ai = fakeAI({ categoryId: 'sys-transporte-apps', confidence: 0.9 });
    const s = await suggestCategory({ local, ai, categories, history }, { description: 'UBER *TRIP', kind: 'expense' });
    expect(s).toMatchObject({ categoryId: 'sys-transporte-apps', source: 'ai', confidence: 0.9 });
    const req = ai.requests[0];
    expect(req.tier).toBe('fast');
    expect(req.prompt).toContain('UBER *TRIP');
    expect(req.prompt).toContain('"Feira do Seu Zé" → Alimentação › Mercado');
    const enumIds = (req.schema as any).properties.categoryId.enum as string[];
    expect(enumIds).toContain('sys-transporte-apps');
    expect(enumIds).not.toContain('sys-receita-salario');
  });

  it('falls back gracefully when the AI fails or does not know', async () => {
    expect(
      await suggestCategory({ local, ai: fakeAI(new Error('offline')), categories, history }, { description: 'XPTO', kind: 'expense' })
    ).toBeNull();
    expect(
      await suggestCategory({ local, ai: fakeAI({ categoryId: 'nenhuma', confidence: 0 }), categories, history }, { description: 'XPTO', kind: 'expense' })
    ).toBeNull();
  });
});
