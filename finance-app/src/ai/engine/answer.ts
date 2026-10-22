import type { Repositories } from '../../data/repositories';
import { askAssistant, type AssistantAnswer } from '../assistant';
import { LOCAL_USER_SCOPE } from '../session';
import type { AIProvider, ChatTurn } from '../types';
import { answerDeterministically, type AnswerContract } from './deterministic';

// Chooses how a question is answered (AI contract §2, §7): rules on the device
// first; the external provider only for questions rules can't cover and only
// when the person authorized it (a provider exists only with that permission).
// A local failure never switches to the cloud by itself.

export function fromContract(c: AnswerContract): AssistantAnswer {
  return {
    text: c.answer,
    toolCalls: [],
    sources: [],
    evidences: c.evidences,
    actions: [],
    check: c.check,
    local: true,
    mode: c.mode,
    evidenceStatus: c.evidenceStatus,
    missingData: c.missingData,
    memoryProposalId: c.memoryProposalId,
    forgetCandidates: c.forgetCandidates,
  };
}

export async function answerQuestion(options: {
  question: string;
  history: ChatTurn[];
  repos: Repositories;
  /** Null unless the external-inference permission is on. */
  provider: AIProvider | null;
  webSearch: boolean;
  onProgress?: (label: string) => void;
  now?: () => Date;
}): Promise<AssistantAnswer> {
  const now = options.now ?? (() => new Date());
  const session = { userScope: LOCAL_USER_SCOPE, repos: options.repos, now };
  const ruled = await answerDeterministically(options.question, session, { externalAvailable: !!options.provider, webAllowed: options.webSearch });
  if (!ruled.needsModel || !options.provider) return fromContract(ruled);
  options.onProgress?.('Perguntando ao provedor externo');
  return askAssistant({ provider: options.provider, repos: options.repos, history: options.history, webSearch: options.webSearch, now });
}
