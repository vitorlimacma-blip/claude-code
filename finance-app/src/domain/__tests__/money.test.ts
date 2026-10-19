import { centsToInput, formatCents, parseAmountToCents, parseSignedAmountToCents } from '../money';

describe('money', () => {
  it.each([
    ['1.234,56', 123456],
    ['45,9', 4590],
    ['1234.56', 123456],
    ['1.234', 123400],
    ['', 0],
    ['abc', 0],
  ])('parses %s', (input, cents) => {
    expect(parseAmountToCents(input)).toBe(cents);
  });

  it('keeps the sign when asked', () => {
    expect(parseSignedAmountToCents('-1.500,00')).toBe(-150000);
    expect(parseSignedAmountToCents('+20')).toBe(2000);
    expect(parseSignedAmountToCents('20')).toBe(2000);
  });

  it('round-trips through the edit format', () => {
    expect(centsToInput(123456)).toBe('1234,56');
    expect(parseAmountToCents(centsToInput(4590))).toBe(4590);
    expect(formatCents(123456).replace(/\s/g, ' ')).toBe('R$ 1.234,56');
  });
});
