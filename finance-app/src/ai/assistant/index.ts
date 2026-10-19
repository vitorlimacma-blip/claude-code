import type { Repositories } from '../../data/repositories';
import type { AgentResult, AIProvider, ChatTurn } from '../types';
import { assistantSystemPrompt, createFinanceTools } from './tools';

/** What the UI shows while each tool runs. */
export const TOOL_LABELS: Record<string, string> = {
  resumo_periodo: 'Resumindo o período',
  buscar_lancamentos: 'Buscando lançamentos',
  gastos_por_mes: 'Comparando meses',
  saldos_contas: 'Consultando saldos',
  orcamentos_do_mes: 'Verificando orçamentos',
  listar_categorias: 'Lendo categorias',
  web_search: 'Pesquisando na internet',
};

/** Only the most recent turns are sent, to bound cost; tools re-fetch any numbers needed. */
const MAX_HISTORY_TURNS = 20;

export async function askAssistant(options: {
  provider: AIProvider;
  repos: Repositories;
  /** Conversation so far, ending with the user's new question. */
  history: ChatTurn[];
  webSearch: boolean;
  onToolCall?: (name: string) => void;
  now?: () => Date;
}): Promise<AgentResult> {
  const now = options.now ?? (() => new Date());
  let history = options.history.slice(-MAX_HISTORY_TURNS);
  // Providers expect the conversation to start with the user.
  while (history.length > 0 && history[0].role !== 'user') history = history.slice(1);
  return options.provider.runAgent({
    system: assistantSystemPrompt(now(), options.webSearch),
    history,
    tools: createFinanceTools(options.repos, now),
    webSearch: options.webSearch,
    onToolCall: (name) => options.onToolCall?.(name),
  });
}
