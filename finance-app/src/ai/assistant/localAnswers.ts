import type { Repositories } from '../../data/repositories';
import { formatDateBR, monthRange, todayKey } from '../../domain/dates';
import { formatCents } from '../../domain/money';
import type { LocalTool } from '../types';
import { AnswerContext } from './evidence';
import type { AssistantAnswer } from './index';
import { createFinanceTools } from './tools';
import { checkAnswer } from './validate';

// Answers computed on the device, without a model: the same tools the AI
// uses, formatted by code. They keep the Assistente useful with the AI off.

export const LOCAL_QUESTIONS = [
  { id: 'changes', label: 'O que mudou neste mês?' },
  { id: 'heavy', label: 'Quais gastos estão pesando?' },
  { id: 'margin', label: 'Quanto sobra até o próximo recebimento?' },
  { id: 'budgets', label: 'Como estão meus orçamentos?' },
] as const;

export type LocalQuestionId = (typeof LOCAL_QUESTIONS)[number]['id'];

interface Money {
  valor: string;
  centavos: number;
}

/** Signed difference for text: "+R$ 120,00" / "−R$ 80,00". */
const signed = (m: Money) => (m.centavos > 0 ? `+${m.valor}` : m.centavos < 0 ? `−${formatCents(-m.centavos)}` : m.valor);

export async function answerLocally(id: LocalQuestionId, repos: Repositories, now: () => Date = () => new Date()): Promise<AssistantAnswer> {
  const ctx = new AnswerContext();
  const tools = new Map<string, LocalTool>(createFinanceTools(repos, ctx, now).map((t) => [t.name, t]));
  const call = <T>(name: string, input: unknown = {}) => tools.get(name)!.run(input) as Promise<T>;
  const today = todayKey(now());
  let text: string;

  if (id === 'changes') {
    const r = await call<{
      referencia: string;
      comparavel: boolean;
      periodo_atual: { de: string; ate: string; gasto: Money };
      periodo_anterior: { de: string; ate: string; gasto: Money };
      diferenca_total: Money;
      por_categoria: { categoria: string; periodo_atual: Money; periodo_anterior: Money; diferenca: Money }[];
    }>('comparar_periodos', { categoria: '' });
    const cur = `${formatDateBR(r.periodo_atual.de)} a ${formatDateBR(r.periodo_atual.ate)}`;
    const prev = `${formatDateBR(r.periodo_anterior.de)} a ${formatDateBR(r.periodo_anterior.ate)}`;
    if (!r.comparavel) {
      text = `Ainda não há um mês anterior completo para comparar. Neste mês (${cur}) você gastou ${r.periodo_atual.gasto.valor} [${r.referencia}].`;
    } else {
      const changed = r.por_categoria.filter((c) => c.diferenca.centavos !== 0).slice(0, 5);
      text = [
        `De ${cur} você gastou ${r.periodo_atual.gasto.valor}, contra ${r.periodo_anterior.gasto.valor} nos mesmos dias do mês anterior (${prev}): ${signed(r.diferenca_total)} [${r.referencia}].`,
        '',
        ...(changed.length
          ? ['Maiores mudanças por categoria:', ...changed.map((c) => `- **${c.categoria}**: ${c.periodo_atual.valor} (antes ${c.periodo_anterior.valor}), ${signed(c.diferenca)}`)]
          : ['Nenhuma categoria mudou.']),
      ].join('\n');
    }
  } else if (id === 'heavy') {
    const { from } = monthRange(today.slice(0, 7));
    const r = await call<{ referencia: string; despesas: Money; despesas_por_categoria: ({ categoria: string } & Money)[] }>('resumo_periodo', { de: from, ate: today });
    const top = r.despesas_por_categoria.slice(0, 5);
    const share = (c: Money) => (r.despesas.centavos > 0 ? Math.round((c.centavos / r.despesas.centavos) * 100) : 0);
    text = top.length
      ? [
          `De ${formatDateBR(from)} a ${formatDateBR(today)} as despesas somam ${r.despesas.valor} [${r.referencia}]. As categorias que mais pesam:`,
          '',
          ...top.map((c) => `- **${c.categoria}**: ${c.valor} (${share(c)}%)`),
        ].join('\n')
      : `Ainda não há despesas de ${formatDateBR(from)} a ${formatDateBR(today)}.`;
  } else if (id === 'margin') {
    const r = await call<{
      referencia: string;
      situacao: string;
      motivo: string;
      periodo: { de: string; ate: string };
      proximo_recebimento: ({ data: string; descricao: string } & Money) | null;
      disponivel_hoje: Money;
      margem: Money;
      menor_saldo_previsto: { data: string } & Money;
      limitacoes: string[];
    }>('margem_ate_recebimento');
    if (r.situacao === 'indisponível') {
      text = `Não dá para estimar a margem agora: ${r.motivo || 'faltam dados.'}`;
    } else {
      const until = r.proximo_recebimento
        ? `até o próximo recebimento (${r.proximo_recebimento.descricao}, ${formatDateBR(r.proximo_recebimento.data)})`
        : `até ${formatDateBR(r.periodo.ate)}`;
      text = [
        `A estimativa é que sobrem ${r.margem.valor} ${until} [${r.referencia}].`,
        '',
        `- Disponível hoje: ${r.disponivel_hoje.valor}`,
        `- Menor saldo previsto: ${r.menor_saldo_previsto.valor} em ${formatDateBR(r.menor_saldo_previsto.data)}`,
        ...r.limitacoes.map((l) => `- Limitação: ${l}`),
      ].join('\n');
    }
  } else {
    const month = today.slice(0, 7);
    const r = await call<{
      referencia: string;
      orcamentos: { categoria: string; orcamento: Money; gasto: Money; projecao_fim_do_mes: Money; situacao: string }[];
    }>('orcamentos_do_mes', { mes: month });
    text = r.orcamentos.length
      ? [
          `Situação dos orçamentos deste mês, com a projeção como estimativa [${r.referencia}]:`,
          '',
          ...r.orcamentos.map((b) => `- **${b.categoria}**: ${b.gasto.valor} de ${b.orcamento.valor} · projeção ${b.projecao_fim_do_mes.valor} · ${b.situacao}`),
        ].join('\n')
      : 'Nenhum orçamento definido para este mês. Você pode definir em Ajustes › Categorias.';
  }

  return { text, toolCalls: [], sources: [], evidences: ctx.evidences, actions: [], check: checkAnswer(text, ctx.evidences), local: true };
}
