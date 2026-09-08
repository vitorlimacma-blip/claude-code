import type { Cents } from '../domain/types';

const formatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

export function formatCents(cents: Cents): string {
  return formatter.format(cents / 100);
}

/**
 * Parses a user-typed amount into integer cents. Accepts pt-BR formatting
 * ("1.234,56"), plain decimals ("1234.56"), and whole numbers ("1234").
 */
export function parseAmountToCents(input: string): Cents {
  let s = input.trim();
  if (s === '') return 0;

  if (s.includes(',')) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (!/\.\d{1,2}$/.test(s)) {
    // A dot not immediately followed by 1-2 trailing digits is a thousands separator.
    s = s.replace(/\./g, '');
  }

  const value = Number(s);
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100);
}
