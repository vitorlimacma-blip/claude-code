import type { AssistantAnswer } from '../assistant';
import type { AnswerContract } from './deterministic';

/** The engine's response contract as the answer shape the Assistente shows. */
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
