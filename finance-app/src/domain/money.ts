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

/** Most digits the money field accepts: R$ 9.999.999.999,99. */
export const MAX_AMOUNT_DIGITS = 12;

/**
 * Cents from what is typed in a money field that fills from the right, like
 * banking apps: typing 1, 2, 3, 4 shows 0,01 → 0,12 → 1,23 → 12,34. Anything
 * but digits (separators, "R$", spaces) is ignored, so it works with any
 * keyboard or locale.
 */
export function centsFromDigits(text: string): Cents {
  const digits = text.replace(/\D/g, '').replace(/^0+/, '').slice(0, MAX_AMOUNT_DIGITS);
  return digits === '' ? 0 : Number(digits);
}

const plainFormatter = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** "1.234,56" (no currency symbol), for the money field. */
export function formatCentsPlain(cents: Cents): string {
  return plainFormatter.format(cents / 100);
}

/**
 * Amount with an explicit sign, so direction never depends on color alone:
 * "+R$ 10,00", "−R$ 10,00" (true minus sign) or "R$ 10,00".
 */
export function formatSignedCents(cents: Cents, sign: 'auto' | 'plus' | 'minus' | 'none' = 'auto'): string {
  const abs = formatCents(Math.abs(cents));
  const resolved = sign === 'auto' ? (cents > 0 ? 'plus' : cents < 0 ? 'minus' : 'none') : sign;
  return resolved === 'plus' ? `+${abs}` : resolved === 'minus' ? `−${abs}` : abs;
}

/** What a screen reader should say for an amount: "menos R$ 10,00". */
export function spokenAmount(cents: Cents, sign: 'auto' | 'plus' | 'minus' | 'none' = 'auto'): string {
  const resolved = sign === 'auto' ? (cents > 0 ? 'plus' : cents < 0 ? 'minus' : 'none') : sign;
  const abs = formatCents(Math.abs(cents));
  return resolved === 'plus' ? `mais ${abs}` : resolved === 'minus' ? `menos ${abs}` : abs;
}
