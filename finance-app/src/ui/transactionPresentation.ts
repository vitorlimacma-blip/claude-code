import { PAYMENT_METHOD_LABELS, NATURE_LABELS } from '../domain/labels';
import { countsInResult, direction, transactionBadge, type ListEntry } from '../domain/transactionDisplay';
import type { Account, Category, TransactionNature } from '../domain/types';
import type { TransactionRowProps } from './TransactionRow';

/** Neutral slate for rows without a category color (transfers, adjustments). */
export const NEUTRAL_ICON_COLOR = '#64748B';

const NATURE_ICONS: Partial<Record<TransactionNature, string>> = {
  transfer: 'swap-horizontal-outline',
  card_payment: 'card-outline',
  investment_contribution: 'trending-up-outline',
  investment_withdrawal: 'trending-up-outline',
  investment_return: 'trending-up-outline',
  refund: 'return-down-back-outline',
  adjustment: 'construct-outline',
};

/** Everything a list row shows for a transaction (or a collapsed transfer). */
export function presentTransaction(
  entry: ListEntry,
  categoryById: Map<string, Category>,
  accountById: Map<string, Account>
): Omit<TransactionRowProps, 'onPress'> {
  const t = entry.transaction;
  const category = t.categoryId ? categoryById.get(t.categoryId) : undefined;
  const account = accountById.get(t.accountId)?.name ?? 'Conta removida';
  const isTransfer = !!t.transferPairId;
  const other = entry.counterpart ? (accountById.get(entry.counterpart.accountId)?.name ?? 'Conta removida') : undefined;
  const accounts = isTransfer
    ? t.type === 'transfer_out'
      ? `${account} → ${other ?? '?'}`
      : `${other ?? '?'} → ${account}`
    : account;
  const subtitle = [
    isTransfer ? null : (category?.name ?? (countsInResult(t) ? 'Sem categoria' : null)),
    accounts,
    !isTransfer && t.paymentMethod !== 'other' ? PAYMENT_METHOD_LABELS[t.paymentMethod] : null,
  ]
    .filter(Boolean)
    .join(' · ');
  const icon = NATURE_ICONS[t.nature] ?? category?.icon ?? 'help-circle-outline';
  const color = NATURE_ICONS[t.nature] && t.nature !== 'refund' ? NEUTRAL_ICON_COLOR : (category?.color ?? NEUTRAL_ICON_COLOR);
  return {
    title: t.description || (isTransfer || !countsInResult(t) ? NATURE_LABELS[t.nature] : (category?.name ?? 'Sem descrição')),
    subtitle,
    amount: t.amount,
    direction: direction(t),
    counts: countsInResult(t),
    badge: transactionBadge(t),
    pending: t.status === 'pending',
    icon,
    color,
  };
}
