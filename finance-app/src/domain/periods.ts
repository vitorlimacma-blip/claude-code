import { addDaysToDateKey, formatDateBR, formatMonthBR, monthRange } from './dates';
import type { DateKey, MonthKey } from './types';

/** Period shown in Lançamentos. */
export type ListPeriod =
  | { kind: 'month'; month: MonthKey }
  | { kind: 'last30' }
  | { kind: 'year'; year: number }
  | { kind: 'custom'; from: DateKey; to: DateKey };

export interface PeriodRange {
  from: DateKey;
  to: DateKey;
  label: string;
}

/** Date range and label of a period, relative to `today`. */
export function periodRange(period: ListPeriod, today: DateKey): PeriodRange {
  switch (period.kind) {
    case 'month':
      return { ...monthRange(period.month), label: formatMonthBR(period.month) };
    case 'last30':
      return { from: addDaysToDateKey(today, -29), to: today, label: 'Últimos 30 dias' };
    case 'year':
      return { from: `${period.year}-01-01`, to: `${period.year}-12-31`, label: String(period.year) };
    case 'custom': {
      const [from, to] = period.from <= period.to ? [period.from, period.to] : [period.to, period.from];
      return { from, to, label: `${formatDateBR(from)} a ${formatDateBR(to)}` };
    }
  }
}
