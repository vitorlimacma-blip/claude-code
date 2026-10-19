import { addMonths, formatDateBR, formatMonthBR, monthRange, parseDateInput, toMonthKey } from '../dates';

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
