import { addDaysToDateKey } from './dates';
import { normalizeMerchant } from './merchant';
import type { Cents, DateKey, Transaction } from './types';

// Open Finance is PREPARED here, not implemented (briefing §14): the contract a
// connector (Pluggy, Belvo or another aggregator) must fulfil, consent and
// connection states, and the reconciliation between manual and imported rows.
// No connector exists in the app, nothing calls a bank, and nothing here
// assumes an aggregator covers every institution or updates instantly.

/** What the person authorized, and until when (consent is always explicit and revocable). */
export interface Consent {
  id: string;
  connectorId: string;
  institutionId: string;
  /** Data the person agreed to share: never more than what the app uses. */
  scopes: ('accounts' | 'balances' | 'transactions' | 'credit_card_bills')[];
  grantedAt: string;
  /** Consents expire (Open Finance Brasil: up to 12 months); null when the connector doesn't say. */
  expiresAt: string | null;
  revokedAt: string | null;
}

export type ConnectionState =
  | 'awaiting_consent'
  | 'active'
  | 'syncing'
  /** Data older than the freshness limit: shown with its date, never as current. */
  | 'stale'
  | 'error'
  | 'consent_expired'
  | 'revoked';

export interface Connection {
  id: string;
  consent: Consent | null;
  /** Last attempt and last success, ISO timestamps. */
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  lastError: string | null;
  syncing: boolean;
  /** Local account each external account feeds (external id → account id). */
  accountLinks: Record<string, string>;
}

/** Data older than this is shown as outdated. */
export const STALE_AFTER_HOURS = 24;

/** The state shown for a connection right now. */
export function connectionState(c: Connection, now: Date): ConnectionState {
  const consent = c.consent;
  if (!consent) return 'awaiting_consent';
  if (consent.revokedAt) return 'revoked';
  if (consent.expiresAt && new Date(consent.expiresAt) <= now) return 'consent_expired';
  if (c.syncing) return 'syncing';
  if (c.lastError && (!c.lastSuccessAt || (c.lastAttemptAt ?? '') > c.lastSuccessAt)) return 'error';
  if (!c.lastSuccessAt) return 'awaiting_consent';
  const ageHours = (now.getTime() - new Date(c.lastSuccessAt).getTime()) / 3_600_000;
  return ageHours > STALE_AFTER_HOURS ? 'stale' : 'active';
}

/** One external transaction, as a connector delivers it (amounts in integer cents, sign by direction). */
export interface ExternalTransaction {
  /** Stable id from the institution or aggregator: the idempotency key. */
  externalId: string;
  externalAccountId: string;
  date: DateKey;
  /** Positive = money in, negative = money out. */
  amount: Cents;
  description: string;
  /** Pending rows may change or disappear; they are never treated as settled. */
  pending: boolean;
}

/** Contract every connector implements. Calls go through a backend the app owns, never with provider secrets in the app. */
export interface BankConnector {
  readonly id: string;
  readonly label: string;
  /** Institutions this connector actually supports (never assume all). */
  listInstitutions(): Promise<{ id: string; name: string }[]>;
  /** Starts consent; the person finishes it in the institution's own flow. */
  requestConsent(institutionId: string, scopes: Consent['scopes']): Promise<{ consentId: string; redirectUrl: string }>;
  revokeConsent(consentId: string): Promise<void>;
  /** Transactions changed since the cursor; the cursor makes repeated syncs incremental and idempotent. */
  fetchTransactions(consentId: string, cursor: string | null): Promise<{ transactions: ExternalTransaction[]; nextCursor: string | null }>;
}

/** One sync, kept as history (what came, what was created, matched or left for review). */
export interface SyncRun {
  id: string;
  connectionId: string;
  startedAt: string;
  finishedAt: string | null;
  status: 'running' | 'succeeded' | 'failed';
  received: number;
  created: number;
  matched: number;
  alreadyImported: number;
  needsReview: number;
  skippedPending: number;
  /** Error shown to the person, never raw provider text or financial data. */
  error: string | null;
}

export type ReconcileDecision =
  /** Same external id already in the ledger: nothing to do (idempotency). */
  | { kind: 'already_imported'; transactionId: string }
  /** One clear manual row is the same movement: link it, don't duplicate. */
  | { kind: 'match'; transactionId: string }
  /** More than one plausible manual row: the person decides; nothing is merged silently. */
  | { kind: 'needs_review'; candidateIds: string[] }
  | { kind: 'new' }
  /** Pending at the bank: waits until it settles. */
  | { kind: 'skip_pending' };

/** Days of tolerance between the manual date and the bank date. */
export const MATCH_WINDOW_DAYS = 3;

const signed = (t: Transaction): Cents => (t.type === 'income' ? t.amount : -t.amount);

function dayDistance(a: DateKey, b: DateKey): number {
  return Math.abs(Date.parse(`${a}T12:00:00Z`) - Date.parse(`${b}T12:00:00Z`)) / 86_400_000;
}

/**
 * Decides what to do with one external transaction against the ledger of the
 * linked account. Same amount and direction within a few days is a candidate;
 * a matching description breaks ties. Ambiguity goes to review.
 */
export function reconcile(external: ExternalTransaction, accountId: string, ledger: Transaction[]): ReconcileDecision {
  const existing = ledger.find((t) => !t.deletedAt && t.externalId === external.externalId);
  if (existing) return { kind: 'already_imported', transactionId: existing.id };
  if (external.pending) return { kind: 'skip_pending' };
  const candidates = ledger.filter(
    (t) =>
      !t.deletedAt &&
      t.accountId === accountId &&
      !t.externalId &&
      !t.transferPairId &&
      signed(t) === external.amount &&
      dayDistance(t.date, external.date) <= MATCH_WINDOW_DAYS
  );
  if (candidates.length === 0) return { kind: 'new' };
  if (candidates.length === 1) return { kind: 'match', transactionId: candidates[0].id };
  const merchant = normalizeMerchant(external.description);
  const sameName = merchant ? candidates.filter((t) => normalizeMerchant(t.description) === merchant) : [];
  if (sameName.length === 1) return { kind: 'match', transactionId: sameName[0].id };
  const pool = sameName.length > 1 ? sameName : candidates;
  const sameDay = pool.filter((t) => t.date === external.date);
  if (sameDay.length === 1) return { kind: 'match', transactionId: sameDay[0].id };
  return { kind: 'needs_review', candidateIds: pool.map((t) => t.id) };
}

/** Where a sync writes; implemented over the repositories when a real connector exists. */
export interface LedgerPort {
  rowsForAccount(accountId: string, from: DateKey, to: DateKey): Promise<Transaction[]>;
  /** Creates the imported row with a deterministic id (`importedTransactionId`), so a retry can't duplicate it. */
  createImported(accountId: string, external: ExternalTransaction): Promise<void>;
  /** Marks a manual row as the same movement as the external one. */
  linkExternal(transactionId: string, externalId: string): Promise<void>;
  /** Puts the case in the review list. */
  queueReview(external: ExternalTransaction, candidateIds: string[]): Promise<void>;
}

/** Applies one page of external transactions; safe to repeat with the same page. */
export async function applyExternalTransactions(
  page: ExternalTransaction[],
  accountLinks: Record<string, string>,
  ledger: LedgerPort
): Promise<Pick<SyncRun, 'received' | 'created' | 'matched' | 'alreadyImported' | 'needsReview' | 'skippedPending'>> {
  const counts = { received: page.length, created: 0, matched: 0, alreadyImported: 0, needsReview: 0, skippedPending: 0 };
  for (const external of page) {
    const accountId = accountLinks[external.externalAccountId];
    if (!accountId) continue;
    const from = addDaysToDateKey(external.date, -MATCH_WINDOW_DAYS);
    const to = addDaysToDateKey(external.date, MATCH_WINDOW_DAYS);
    const rows = await ledger.rowsForAccount(accountId, from, to);
    const decision = reconcile(external, accountId, rows);
    switch (decision.kind) {
      case 'already_imported':
        counts.alreadyImported++;
        break;
      case 'skip_pending':
        counts.skippedPending++;
        break;
      case 'match':
        await ledger.linkExternal(decision.transactionId, external.externalId);
        counts.matched++;
        break;
      case 'needs_review':
        await ledger.queueReview(external, decision.candidateIds);
        counts.needsReview++;
        break;
      case 'new':
        await ledger.createImported(accountId, external);
        counts.created++;
        break;
    }
  }
  return counts;
}

