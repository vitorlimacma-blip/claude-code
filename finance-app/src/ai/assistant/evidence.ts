import type { CategorySource, Cents, DateKey, TransactionType } from '../../domain/types';

// The record behind an assistant answer (briefing §11): every number the
// model saw comes from a tool call registered here, with its period, criteria
// and the transactions that produced it, so the answer can be checked.

/** A fact is computed from recorded data; an estimate also depends on assumptions (typical month, expected bills). */
export type EvidenceKind = 'fato' | 'estimativa' | 'documento';

export interface Evidence {
  /** "E1", "E2"…: what the answer cites. */
  ref: string;
  title: string;
  kind: EvidenceKind;
  period: { from: DateKey; to: DateKey } | null;
  /** Filters, rules and assumptions used, in plain Portuguese. */
  criteria: string[];
  /** Transactions behind the numbers (empty when the result isn't a sum of transactions). */
  transactionIds: string[];
  /** Every amount (in cents) returned to the model in this result. */
  amounts: Cents[];
  /** Approved document chunks behind it (kind 'documento'). */
  chunkIds?: string[];
}

/** A change the assistant proposes; nothing is written until the user confirms it. */
export type AssistantAction =
  | {
      kind: 'recategorize';
      id: string;
      /** Transactions to move and the category each had, for the preview and for undo. */
      items: { transactionId: string; previousCategoryId: string | null; previousCategorySource: CategorySource | null }[];
      toCategoryId: string;
      toLabel: string;
      total: Cents;
    }
  | {
      kind: 'draft';
      id: string;
      draft: { type: Extract<TransactionType, 'expense' | 'income'>; amount: Cents; description: string; categoryId: string | null; date: DateKey };
    };

/** An action before it gets its id. */
export type NewAssistantAction = {
  [K in AssistantAction['kind']]: Omit<Extract<AssistantAction, { kind: K }>, 'id'>;
}[AssistantAction['kind']];

/** Collects the evidence and proposed actions of one answer. */
export class AnswerContext {
  readonly evidences: Evidence[] = [];
  readonly actions: AssistantAction[] = [];

  addEvidence(evidence: Omit<Evidence, 'ref'>): string {
    const ref = `E${this.evidences.length + 1}`;
    this.evidences.push({ ...evidence, ref });
    return ref;
  }

  addAction(action: NewAssistantAction): string {
    const id = `A${this.actions.length + 1}`;
    this.actions.push({ ...action, id });
    return id;
  }
}

/** Every `centavos` (or `*_centavos`) number in a tool result: the amounts the model was given. */
export function collectCents(value: unknown, out: Cents[] = []): Cents[] {
  if (Array.isArray(value)) {
    for (const item of value) collectCents(item, out);
  } else if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) {
      if ((key === 'centavos' || key.endsWith('_centavos')) && typeof item === 'number' && Number.isSafeInteger(item)) out.push(item);
      else collectCents(item, out);
    }
  }
  return out;
}

const CONTROL = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g;
const MAX_DESCRIPTION = 80;

/**
 * Transaction text as it goes to the model: one line, bounded length, no
 * control characters. It is data, never instructions (the system prompt says
 * so too); this keeps a crafted description from posing as a new message.
 */
export function sanitizeForModel(text: string): string {
  const clean = text.replace(CONTROL, ' ').replace(/\s+/g, ' ').trim();
  return clean.length > MAX_DESCRIPTION ? `${clean.slice(0, MAX_DESCRIPTION - 1)}…` : clean;
}
