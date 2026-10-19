/** Formats a Date as a local YYYY-MM-DD string (no timezone shifting). */
export function toDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function daysInMonth(year: number, month: number /* 0-11 */): number {
  return new Date(year, month + 1, 0).getDate();
}

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function daysInYear(year: number): number {
  return isLeapYear(year) ? 366 : 365;
}

/** 1-indexed day-of-year for the given date. */
export function dayOfYear(date: Date): number {
  const start = new Date(date.getFullYear(), 0, 1);
  const diff = date.getTime() - start.getTime();
  return Math.floor(diff / 86_400_000) + 1;
}

export function startOfMonthKey(date: Date): string {
  return toDateKey(new Date(date.getFullYear(), date.getMonth(), 1));
}

export function startOfYearKey(date: Date): string {
  return toDateKey(new Date(date.getFullYear(), 0, 1));
}

/** YYYY-MM for the given date. */
export function toMonthKey(date: Date): string {
  return toDateKey(date).slice(0, 7);
}

/** Parses a YYYY-MM-DD key as a local date (no timezone shifting). */
export function fromDateKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** "2026-03-09" -> "09/03/2026". */
export function formatDateBR(key: string): string {
  const [y, m, d] = key.split('-');
  return `${d}/${m}/${y}`;
}

const MONTHS_PT = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

/** "2026-03" -> "março de 2026". */
export function formatMonthBR(monthKey: string): string {
  const [y, m] = monthKey.split('-').map(Number);
  return `${MONTHS_PT[m - 1]} de ${y}`;
}

/**
 * Parses a user-typed date into a YYYY-MM-DD key. Accepts "dd/mm/aaaa",
 * "dd/mm" (current year of `reference`) and "aaaa-mm-dd". Returns null for
 * anything that isn't a real calendar date.
 */
export function parseDateInput(input: string, reference: Date = new Date()): string | null {
  const s = input.trim();
  let y: number, m: number, d: number;
  let match: RegExpMatchArray | null;
  if ((match = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/))) {
    [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  } else if ((match = s.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2}|\d{4}))?$/))) {
    d = Number(match[1]);
    m = Number(match[2]);
    y = match[3] ? Number(match[3].length === 2 ? `20${match[3]}` : match[3]) : reference.getFullYear();
  } else {
    return null;
  }
  if (m < 1 || m > 12 || d < 1 || d > daysInMonth(y, m - 1)) return null;
  return toDateKey(new Date(y, m - 1, d));
}

/** "2026-01", -1 -> "2025-12". */
export function addMonths(monthKey: string, delta: number): string {
  const [y, m] = monthKey.split('-').map(Number);
  return toMonthKey(new Date(y, m - 1 + delta, 1));
}

/** First and last day keys of a YYYY-MM month. */
export function monthRange(monthKey: string): { from: string; to: string } {
  const [y, m] = monthKey.split('-').map(Number);
  return { from: `${monthKey}-01`, to: `${monthKey}-${String(daysInMonth(y, m - 1)).padStart(2, '0')}` };
}
