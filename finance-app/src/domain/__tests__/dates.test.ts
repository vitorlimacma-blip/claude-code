import {
  addMonths,
  dayOfYear,
  addMonthsToDateKey,
  dayOfMonthKey,
  formatDateBR,
  formatMonthBR,
  monthRange,
  parseDateInput,
  todayKey,
  toMonthKey,
} from '../dates';

describe('parseDateInput', () => {
  const ref = new Date(2026, 2, 10);
  it.each([
    ['09/03/2026', '2026-03-09'],
    ['9/3/26', '2026-03-09'],
    ['09/03', '2026-03-09'],
    ['2026-03-09', '2026-03-09'],
    [' 29/02/2028 ', '2028-02-29'],
  ])('parses %s', (input, expected) => {
    expect(parseDateInput(input, ref)).toBe(expected);
  });

  it.each(['31/02/2026', '29/02/2026', '00/01/2026', '12/13/2026', 'ontem', ''])('rejects %s', (input) => {
    expect(parseDateInput(input, ref)).toBeNull();
  });
});

describe('formatting', () => {
  it('formats dates and months in pt-BR', () => {
    expect(formatDateBR('2026-03-09')).toBe('09/03/2026');
    expect(formatMonthBR('2026-03')).toBe('março de 2026');
    expect(toMonthKey(new Date(2026, 11, 31))).toBe('2026-12');
  });
});

describe('month helpers', () => {
  it('adds months across year boundaries', () => {
    expect(addMonths('2026-01', -1)).toBe('2025-12');
    expect(addMonths('2026-12', 1)).toBe('2027-01');
  });

  it('gives the full range of a month', () => {
    expect(monthRange('2028-02')).toEqual({ from: '2028-02-01', to: '2028-02-29' });
  });
});

describe('todayKey (time zone, briefing §9)', () => {
  it('uses São Paulo time, not UTC: 01:30 UTC on the 1st is still the last day of the previous month there', () => {
    const instant = new Date('2026-04-01T01:30:00Z'); // 2026-03-31 22:30 in São Paulo (UTC-3)
    expect(todayKey(instant)).toBe('2026-03-31');
    expect(todayKey(instant, 'UTC')).toBe('2026-04-01');
  });

  it('turns the year at São Paulo midnight', () => {
    expect(todayKey(new Date('2027-01-01T02:59:00Z'))).toBe('2026-12-31');
    expect(todayKey(new Date('2027-01-01T03:00:00Z'))).toBe('2027-01-01');
  });

  it('is independent of the device time zone', () => {
    const instant = new Date('2026-07-15T23:30:00Z'); // 20:30 in São Paulo, already the 16th in Tokyo
    expect(todayKey(instant)).toBe('2026-07-15');
    expect(todayKey(instant, 'Asia/Tokyo')).toBe('2026-07-16');
  });
});

describe('addMonthsToDateKey / dayOfMonthKey', () => {
  it('clamps to the last day of shorter months and handles leap years', () => {
    expect(addMonthsToDateKey('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonthsToDateKey('2028-01-31', 1)).toBe('2028-02-29');
    expect(addMonthsToDateKey('2026-03-31', -1)).toBe('2026-02-28');
    expect(addMonthsToDateKey('2026-12-15', 1)).toBe('2027-01-15');
  });

  it('builds a day inside a month', () => {
    expect(dayOfMonthKey('2026-02', 30)).toBe('2026-02-28');
    expect(dayOfMonthKey('2026-04', 5)).toBe('2026-04-05');
  });
});

describe('dayOfYear', () => {
  it('counts calendar days even across a daylight-saving change in the device zone', () => {
    expect(dayOfYear(new Date(2026, 0, 1))).toBe(1);
    expect(dayOfYear(new Date(2026, 2, 10))).toBe(69);
    expect(dayOfYear(new Date(2028, 11, 31))).toBe(366);
  });
});
