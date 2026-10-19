import type { Cents } from './types';

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
 * Works on the digit string, never through floating point; a third decimal
 * digit rounds half up. Returns 0 for anything that isn't a number.
 */
export function parseAmountToCents(input: string): Cents {
  let s = input.trim().replace(/^R\$\s*/i, '').replace(/\s/g, '');
  if (s === '') return 0;

  if (s.includes(',')) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (!/\.\d{1,2}$/.test(s)) {
    // A dot not immediately followed by 1-2 trailing digits is a thousands separator.
    s = s.replace(/\./g, '');
  }

  const match = s.match(/^(\d*)(?:\.(\d*))?$/);
  if (!match || (match[1] === '' && !match[2])) return 0;
  const whole = match[1] || '0';
  const fraction = (match[2] ?? '').padEnd(3, '0');
  let cents = Number(whole) * 100 + Number(fraction.slice(0, 2));
  if (Number(fraction[2]) >= 5) cents += 1;
  return Number.isSafeInteger(cents) ? cents : 0;
}

/** Cents as an editable pt-BR amount without currency symbol: 123456 -> "1234,56". */
export function centsToInput(cents: Cents): string {
  return (cents / 100).toFixed(2).replace('.', ',');
}

/** Like `parseAmountToCents`, but keeps a leading minus sign: "-1.234,56" -> -123456. */
export function parseSignedAmountToCents(input: string): Cents {
  const trimmed = input.trim();
  const negative = /^-/.test(trimmed);
  const cents = parseAmountToCents(trimmed.replace(/^[-+]\s*/, ''));
  return negative ? -cents : cents;
}
