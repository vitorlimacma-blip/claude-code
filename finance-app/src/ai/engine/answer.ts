import type { Repositories } from '../../data/repositories';
import { askAssistant, type AssistantAnswer } from '../assistant';
import { LOCAL_USER_SCOPE } from '../session';
import type { ModelEngine } from '../local/types';
import type { AIProvider, ChatTurn } from '../types';
import { fromContract } from './contract';
import { answerDeterministically } from './deterministic';
import { answerWithLocalModel } from './localModel';

export { fromContract } from './contract';

// Chooses how a question is answered (AI contract §2, §7): rules on the device
// first; the external provider only for questions rules can't cover and only
// when the person authorized it (a provider exists only with that permission).
// A local failure never switches to the cloud by itself.

export async function answerQuestion(options: {
  question: string;
  history: ChatTurn[];
  repos: Repositories;
  /** Null unless the external-inference permission is on. */
  provider: AIProvider | null;
  webSearch: boolean;
  /** A local engine that is ready (on this device or this computer); it explains the calculated facts. */
  localEngine?: ModelEngine | null;
  onProgress?: (label: string) => void;
  onToken?: (text: string) => void;
  now?: () => Date;
}): Promise<AssistantAnswer> {
  const now = options.now ?? (() => new Date());
  const session = { userScope: LOCAL_USER_SCOPE, repos: options.repos, now };
  const ruled = await answerDeterministically(options.question, session, { externalAvailable: !!options.provider, webAllowed: options.webSearch });
  const local = options.localEngine && options.localEngine.state().kind === 'ready' ? options.localEngine : null;
  if (local && !ruled.forgetCandidates && !ruled.memoryProposalId) {
    options.onProgress?.('Escrevendo com o modelo local');
    try {
      return await answerWithLocalModel(options.question, ruled, local, options.onToken);
    } catch {
      // A local failure never switches to the cloud: the factual answer stands (contract §7).
      return { ...fromContract(ruled), notice: 'O modelo local não respondeu; esta é a resposta calculada pelo app.' };
    }
  }
  if (!ruled.needsModel || !options.provider) return fromContract(ruled);
  options.onProgress?.('Perguntando ao provedor externo');
  return askAssistant({ provider: options.provider, repos: options.repos, history: options.history, webSearch: options.webSearch, now });
}
