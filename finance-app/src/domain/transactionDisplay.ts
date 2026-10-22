import { formatDayHeading } from './dates';
import { resultDelta, resultEffect } from './ledger';
import type { Cents, DateKey, Transaction, TransactionNature } from './types';

// How transactions read in a list (briefing §7): one row per transfer, special
// natures recognizable at a glance, grouped by day.

/** A row of the list: a transaction, plus the other leg when it is a transfer. */
export interface ListEntry {
  transaction: Transaction;
  /** The other side of a transfer, when it is in the loaded period. */
  counterpart?: Transaction;
}

/**
 * Shows each transfer once. The outgoing leg is kept, unless only the
 * incoming leg's account is being looked at (`focusAccountIds`), so a filter
 * by the destination account still lists it, as money in.
 */
export function collapseTransfers(rows: Transaction[], focusAccountIds: string[] = [], allRows: Transaction[] = rows): ListEntry[] {
  const legsByPair = new Map<string, Transaction[]>();
  for (const t of allRows) {
    if (!t.transferPairId) continue;
    const legs = legsByPair.get(t.transferPairId) ?? [];
    legs.push(t);
    legsByPair.set(t.transferPairId, legs);
  }
  const focus = new Set(focusAccountIds);
  const seenPairs = new Set<string>();
  const entries: ListEntry[] = [];
  for (const t of rows) {
    if (!t.transferPairId) {
      entries.push({ transaction: t });
      continue;
    }
    if (seenPairs.has(t.transferPairId)) continue;
    const legs = legsByPair.get(t.transferPairId) ?? [t];
    const out = legs.find((l) => l.type === 'transfer_out');
    const inn = legs.find((l) => l.type === 'transfer_in');
    const preferIn = inn && focus.size > 0 && focus.has(inn.accountId) && (!out || !focus.has(out.accountId));
    const shown = preferIn ? inn : (out ?? inn ?? t);
    // The visible leg must be one of the rows that passed the filters.
    const chosen = rows.includes(shown) ? shown : t;
    seenPairs.add(t.transferPairId);
    entries.push({ transaction: chosen, counterpart: legs.find((l) => l !== chosen) });
  }
  return entries;
}

export interface DaySection {
  date: DateKey;
  title: string;
  /** Effect of the day's rows on the result (income − spending), transfers excluded. */
  total: Cents;
  data: ListEntry[];
}

/** Groups entries (already sorted newest first) by date. */
export function groupByDay(entries: ListEntry[], today: DateKey): DaySection[] {
  const sections: DaySection[] = [];
  for (const entry of entries) {
    const date = entry.transaction.date;
    let section = sections[sections.length - 1];
    if (!section || section.date !== date) {
      section = { date, title: formatDayHeading(date, today), total: 0, data: [] };
      sections.push(section);
    }
    section.data.push(entry);
    section.total += resultDelta(entry.transaction);
  }
  return sections;
}

const NATURE_BADGES: Partial<Record<TransactionNature, string>> = {
  transfer: 'Transferência',
  card_payment: 'Pagamento de fatura',
  investment_contribution: 'Aporte',
  investment_withdrawal: 'Resgate',
  investment_return: 'Rendimento',
  refund: 'Estorno',
  adjustment: 'Ajuste de saldo',
};

/** Short tag that makes special rows recognizable: nature, and "Parcela 2/3". */
export function transactionBadge(t: Pick<Transaction, 'nature' | 'installmentNumber' | 'installmentTotal'>): string | undefined {
  const parts = [
    NATURE_BADGES[t.nature],
    t.installmentNumber && t.installmentTotal ? `Parcela ${t.installmentNumber}/${t.installmentTotal}` : undefined,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : undefined;
}

/** Whether the row counts in income/spending totals (transfers, card payments, investment moves don't). */
export function countsInResult(t: Pick<Transaction, 'type' | 'nature'>): boolean {
  return resultEffect(t) !== 'neutral';
}

/** Money in or out of the row's own account. */
export function direction(t: Pick<Transaction, 'type'>): 'in' | 'out' {
  return t.type === 'income' || t.type === 'transfer_in' ? 'in' : 'out';
}
