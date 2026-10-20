import { prepareDatabase, DEFAULT_ACCOUNT_ID } from '../../data/setup';
import { createTestContext } from '../../test-utils/testDb';
import { AnswerContext } from '../assistant/evidence';
import { createFinanceTools } from '../assistant/tools';
import type { LocalTool } from '../types';

async function setup() {
  const ctx = createTestContext();
  const repos = await prepareDatabase(ctx);
  const answer = new AnswerContext();
  const tools = createFinanceTools(repos, answer, () => new Date(2026, 2, 10, 12));
  const tool = (name: string) => tools.find((t) => t.name === name) as LocalTool;
  const add = (date: string, amount: number, categoryId: string | null, description = '', type: 'expense' | 'income' = 'expense') =>
    repos.transactions.create({ accountId: DEFAULT_ACCOUNT_ID, type, amount, date, categoryId, description });
  return { repos, tool, add, answer, tools };
}

describe('assistant tools', () => {
  it('declare strict-friendly schemas (all fields required, no extras)', async () => {
    const { tools } = await setup();
    for (const t of tools) {
      const schema = t.parameters as { properties: object; required: string[]; additionalProperties: boolean };
      expect(schema.additionalProperties).toBe(false);
      expect(schema.required.sort()).toEqual(Object.keys(schema.properties).sort());
    }
  });

  it('summarizes a period by parent category, ignoring transfers', async () => {
    const { repos, tool, add } = await setup();
    await add('2026-03-01', 10000, 'sys-alimentacao-mercado');
    await add('2026-03-02', 2500, 'sys-alimentacao-delivery');
    await add('2026-03-03', 900, null);
    await add('2026-03-05', 500000, 'sys-receita-salario', 'Salário', 'income');
    const card = await repos.accounts.create({ name: 'Cartão', type: 'credit_card' });
    await repos.transactions.createTransfer({ fromAccountId: DEFAULT_ACCOUNT_ID, toAccountId: card.id, amount: 7000, date: '2026-03-06' });

    const out = (await tool('resumo_periodo').run({ de: '2026-03-01', ate: '2026-03-31' })) as any;
    expect(out.despesas.centavos).toBe(13400);
    expect(out.receitas.centavos).toBe(500000);
    expect(out.despesas_por_categoria).toEqual([
      { categoria: 'Alimentação', valor: expect.stringContaining('125,00'), centavos: 12500 },
      { categoria: 'Sem categoria', valor: expect.stringContaining('9,00'), centavos: 900 },
    ]);
  });

  it('searches by category name (accent-insensitive, includes subcategories) and text', async () => {
    const { tool, add } = await setup();
    await add('2026-02-10', 4000, 'sys-alimentacao-mercado', 'Feira');
    await add('2026-03-02', 6000, 'sys-alimentacao-restaurantes', 'Almoço');
    await add('2026-03-03', 3000, 'sys-transporte-combustivel', 'Posto');

    const byCategory = (await tool('buscar_lancamentos').run({
      de: '2026-01-01', ate: '2026-03-31', texto: '', categoria: 'alimentacao', tipo: 'despesa', limite: 10,
    })) as any;
    expect(byCategory.encontrados).toBe(2);
    expect(byCategory.total.centavos).toBe(10000);
    expect(byCategory.lancamentos[0]).toMatchObject({ descricao: 'Almoço', categoria: 'Alimentação › Restaurantes' });

    const byText = (await tool('buscar_lancamentos').run({
      de: '2026-01-01', ate: '2026-03-31', texto: 'almoco', categoria: '', tipo: 'todos', limite: 10,
    })) as any;
    expect(byText.encontrados).toBe(1);

    await expect(
      tool('buscar_lancamentos').run({ de: '2026-01-01', ate: '2026-03-31', texto: '', categoria: 'xyz', tipo: 'todos', limite: 5 })
    ).rejects.toThrow('Nenhuma categoria');
    await expect(
      tool('buscar_lancamentos').run({ de: '01/01/2026', ate: '2026-03-31', texto: '', categoria: '', tipo: 'todos', limite: 5 })
    ).rejects.toThrow('inválida');
  });

  it('answers "how much did I spend on food in the last 3 months" month by month', async () => {
    const { tool, add } = await setup();
    await add('2026-01-15', 30000, 'sys-alimentacao-mercado');
    await add('2026-02-15', 20000, 'sys-alimentacao');
    await add('2026-03-05', 10000, 'sys-alimentacao-delivery');
    await add('2026-03-06', 99999, 'sys-lazer');
    await add('2025-12-20', 77777, 'sys-alimentacao'); // outside the window

    const out = (await tool('gastos_por_mes').run({ meses: 3, categoria: 'Alimentação' })) as any;
    expect(out.meses.map((m: any) => [m.mes, m.despesas.centavos, m.parcial])).toEqual([
      ['2026-01', 30000, false],
      ['2026-02', 20000, false],
      ['2026-03', 10000, true],
    ]);
  });

  it('reports budgets with the same projection as the Resumo (typical month, no naive pace)', async () => {
    const { repos, tool, add } = await setup();
    await repos.budgets.set('sys-alimentacao', 50000);
    await add('2026-03-02', 30000, 'sys-alimentacao-mercado');

    // Without history, only what is known: R$ 300 of R$ 500 is not flagged by stretching 2 days to 31.
    const withoutHistory = (await tool('orcamentos_do_mes').run({ mes: '2026-03' })) as any;
    expect(withoutHistory.orcamentos).toEqual([
      expect.objectContaining({ categoria: 'Alimentação', projecao_fim_do_mes: expect.objectContaining({ centavos: 30000 }), situacao: 'Dentro do previsto' }),
    ]);

    // With a typical month of R$ 600, the rest of the month is expected: R$ 300 + R$ 300 = R$ 600 > R$ 500.
    for (const m of ['2025-12', '2026-01', '2026-02']) await add(`${m}-01`, 60000, 'sys-alimentacao-mercado');
    const withHistory = (await tool('orcamentos_do_mes').run({ mes: '2026-03' })) as any;
    expect(withHistory.orcamentos).toEqual([
      expect.objectContaining({ categoria: 'Alimentação', projecao_fim_do_mes: expect.objectContaining({ centavos: 60000 }), situacao: 'Pode passar do limite' }),
    ]);
  });
});
