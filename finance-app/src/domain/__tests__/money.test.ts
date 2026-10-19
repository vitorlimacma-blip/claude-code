import {
  centsFromDigits,
  centsToInput,
  formatCents,
  formatCentsPlain,
  formatSignedCents,
  parseAmountToCents,
  parseSignedAmountToCents,
  spokenAmount,
} from '../money';

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

describe('parseAmountToCents without floating point', () => {
  it.each([
    ['0,1', 10],
    ['0,07', 7],
    ['1,005', 101], // half up on the third decimal
    ['1,004', 100],
    ['R$ 2.345,67', 234567],
    ['19,99', 1999], // 19.99 * 100 is 1998.9999… in floating point
    ['1.234.567,89', 123456789],
    [',5', 50],
    ['1,2,3', 0],
    ['-5', 0], // signs are handled by parseSignedAmountToCents
  ])('%s -> %i', (input, cents) => {
    expect(parseAmountToCents(input)).toBe(cents);
  });
});

describe('money field helpers', () => {
  it('fills from the right, ignoring anything but digits', () => {
    expect(centsFromDigits('')).toBe(0);
    expect(centsFromDigits('1')).toBe(1);
    expect(centsFromDigits('1234')).toBe(1234);
    expect(centsFromDigits('R$ 12,34')).toBe(1234);
    expect(centsFromDigits('0001')).toBe(1);
    expect(centsFromDigits('9'.repeat(20))).toBe(999999999999);
  });

  it('formats without the currency, and with an explicit sign', () => {
    const nbsp = (s: string) => s.replace(/ /g, ' ');
    expect(formatCentsPlain(123456)).toBe('1.234,56');
    expect(formatCentsPlain(5)).toBe('0,05');
    expect(nbsp(formatSignedCents(1000))).toBe('+R$ 10,00');
    expect(nbsp(formatSignedCents(-1000))).toBe('−R$ 10,00');
    expect(nbsp(formatSignedCents(0))).toBe('R$ 0,00');
    expect(nbsp(formatSignedCents(1000, 'minus'))).toBe('−R$ 10,00');
    expect(nbsp(spokenAmount(-1050))).toBe('menos R$ 10,50');
  });
});
