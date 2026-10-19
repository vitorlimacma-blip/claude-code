import type { AccountType, PaymentMethod, TransactionNature } from './types';

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

export const NATURE_LABELS: Record<TransactionNature, string> = {
  expense: 'Despesa',
  income: 'Receita',
  transfer: 'Transferência',
  card_payment: 'Pagamento de fatura',
  investment_contribution: 'Aporte',
  investment_withdrawal: 'Resgate',
  investment_return: 'Rendimento',
  refund: 'Estorno',
  adjustment: 'Ajuste de saldo',
};
