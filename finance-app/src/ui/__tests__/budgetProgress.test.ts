import { budgetProgressState } from '../BudgetProgress';

const plain = (s: string) => s.replace(/ /g, ' ');

describe('budgetProgressState', () => {
  it('says what is left and where the projection lands', () => {
    const s = budgetProgressState(126770, 180000, 206835);
    expect(s.fill).toBeCloseTo(0.704, 3);
    expect(s.marker).toBe(1);
    expect(s.over).toBe(false);
    expect(plain(s.detail)).toBe('Restam R$ 532,30 · projeção R$ 2.068,35');
    expect(plain(s.summary)).toBe('R$ 1.267,70 de R$ 1.800,00. Restam R$ 532,30 · projeção R$ 2.068,35');
  });

  it('states going over in words and caps the bar', () => {
    const s = budgetProgressState(25000, 20000);
    expect(s).toMatchObject({ fill: 1, marker: null, over: true });
    expect(plain(s.detail)).toBe('R$ 50,00 acima do orçamento');
  });

  it('does not invent a percentage without a budget', () => {
    expect(budgetProgressState(5000, 0)).toMatchObject({ fill: 0, marker: null, detail: 'Sem orçamento definido' });
  });
});
