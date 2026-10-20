import type { Repositories } from '../../data/repositories';
import type { AIProvider, ChatTurn } from '../types';
import { AnswerContext, type AssistantAction, type Evidence } from './evidence';
import { assistantSystemPrompt, createFinanceTools } from './tools';
import { checkAnswer, type AnswerCheck } from './validate';

export type { AssistantAction, Evidence } from './evidence';
export type { AnswerCheck } from './validate';

/** What the UI shows while each tool runs. */
export const TOOL_LABELS: Record<string, string> = {
  resumo_periodo: 'Resumindo o período',
  buscar_lancamentos: 'Buscando lançamentos',
  gastos_por_mes: 'Comparando meses',
  comparar_periodos: 'Comparando com o mês anterior',
  saldos_contas: 'Consultando saldos',
  margem_ate_recebimento: 'Calculando a margem',
  simular_compra: 'Simulando a compra',
  orcamentos_do_mes: 'Verificando orçamentos',
  listar_categorias: 'Lendo categorias',
  propor_recategorizacao: 'Preparando a proposta',
  rascunho_lancamento: 'Preparando o rascunho',
  web_search: 'Pesquisando na internet',
};

/** One answer with everything needed to check it: evidence, proposed changes and the validation result. */
export interface AssistantAnswer {
  text: string;
  toolCalls: { name: string; input: unknown }[];
  sources: { title: string; url: string }[];
  evidences: Evidence[];
  actions: AssistantAction[];
  check: AnswerCheck;
  /** Computed on the device, without a model. */
  local: boolean;
}

/** Only the most recent turns are sent, to bound cost; tools re-fetch any numbers needed. */
const MAX_HISTORY_TURNS = 20;

/**
 * Pipeline of briefing §11: the model reads the intent and picks authorized
 * tools (consulta); the tools calculate with the app's own rules (cálculo);
 * the answer is checked against what the tools returned (validação); the
 * model's text explains it, citing the evidence (explicação).
 */
export async function askAssistant(options: {
  provider: AIProvider;
  repos: Repositories;
  /** Conversation so far, ending with the user's new question. */
  history: ChatTurn[];
  webSearch: boolean;
  onToolCall?: (name: string) => void;
  now?: () => Date;
}): Promise<AssistantAnswer> {
  const now = options.now ?? (() => new Date());
  let history = options.history.slice(-MAX_HISTORY_TURNS);
  // Providers expect the conversation to start with the user.
  while (history.length > 0 && history[0].role !== 'user') history = history.slice(1);
  const ctx = new AnswerContext();
  const result = await options.provider.runAgent({
    system: assistantSystemPrompt(now(), options.webSearch),
    history,
    tools: createFinanceTools(options.repos, ctx, now),
    webSearch: options.webSearch,
    onToolCall: (name) => options.onToolCall?.(name),
  });
  return {
    ...result,
    evidences: ctx.evidences,
    actions: ctx.actions,
    check: checkAnswer(result.text, ctx.evidences),
    local: false,
  };
}
