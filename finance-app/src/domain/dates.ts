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

/** 1-indexed day-of-year for the given date. Counted in UTC so a daylight-saving change can't lose a day. */
export function dayOfYear(date: Date): number {
  const diff = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) - Date.UTC(date.getFullYear(), 0, 1);
  return diff / 86_400_000 + 1;
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

/** Time zone dates are interpreted in unless the user picks another (decision D-009). */
export const DEFAULT_TIME_ZONE = 'America/Sao_Paulo';

/**
 * Today's date key in `timeZone`, regardless of the device's own zone, so
 * "today" doesn't jump a day early or late around midnight. Falls back to the
 * device zone if the runtime lacks time zone data.
 */
export function todayKey(now: Date = new Date(), timeZone: string = DEFAULT_TIME_ZONE): string {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' })
      .formatToParts(now)
      .reduce<Record<string, string>>((acc, p) => ({ ...acc, [p.type]: p.value }), {});
    if (parts.year && parts.month && parts.day) return `${parts.year}-${parts.month}-${parts.day}`;
  } catch {
    // Fall through to the device zone.
  }
  return toDateKey(now);
}

/** Same day `delta` months later, clamped to the month's last day (Jan 31 + 1 -> Feb 28/29). */
export function addMonthsToDateKey(key: string, delta: number): string {
  const [y, m, d] = key.split('-').map(Number);
  const first = new Date(y, m - 1 + delta, 1);
  const day = Math.min(d, daysInMonth(first.getFullYear(), first.getMonth()));
  return toDateKey(new Date(first.getFullYear(), first.getMonth(), day));
}

/** Day `day` of a YYYY-MM month, clamped to the month's last day. */
export function dayOfMonthKey(monthKey: string, day: number): string {
  const [y, m] = monthKey.split('-').map(Number);
  return `${monthKey}-${String(Math.min(day, daysInMonth(y, m - 1))).padStart(2, '0')}`;
}

const WEEKDAYS_PT = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];

/** Heading of a day in a list: "Hoje", "Ontem", "sexta-feira, 17 de outubro" (with the year when not the current one). */
export function formatDayHeading(key: string, today: string): string {
  if (key === today) return 'Hoje';
  const date = fromDateKey(key);
  if (key === addDaysToDateKey(today, -1)) return 'Ontem';
  const base = `${WEEKDAYS_PT[date.getDay()]}, ${date.getDate()} de ${MONTHS_PT[date.getMonth()]}`;
  return key.slice(0, 4) === today.slice(0, 4) ? base : `${base} de ${key.slice(0, 4)}`;
}

/** Day `delta` days after `key` (negative for before). */
export function addDaysToDateKey(key: string, delta: number): string {
  const d = fromDateKey(key);
  return toDateKey(new Date(d.getFullYear(), d.getMonth(), d.getDate() + delta));
}
