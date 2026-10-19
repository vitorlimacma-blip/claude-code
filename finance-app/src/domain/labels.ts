import type { AccountType, PaymentMethod } from './types';

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  pix: 'Pix',
  debit: 'Débito',
  credit: 'Crédito',
  boleto: 'Boleto',
  cash: 'Dinheiro',
  transfer: 'TED/transferência',
  other: 'Outro',
};

export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  checking: 'Conta corrente',
  savings: 'Poupança',
  wallet: 'Carteira',
  credit_card: 'Cartão de crédito',
  investment: 'Investimentos',
  other: 'Outra',
};

export const ACCOUNT_TYPE_ICONS: Record<AccountType, string> = {
  checking: 'business-outline',
  savings: 'save-outline',
  wallet: 'wallet-outline',
  credit_card: 'card-outline',
  investment: 'trending-up-outline',
  other: 'ellipsis-horizontal-circle-outline',
};
