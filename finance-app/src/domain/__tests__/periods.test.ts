import { periodRange } from '../periods';

describe('periodRange', () => {
  const today = '2026-10-19';
  it('covers a whole month, the last 30 days, a year or a custom range', () => {
    expect(periodRange({ kind: 'month', month: '2026-02' }, today)).toEqual({ from: '2026-02-01', to: '2026-02-28', label: 'fevereiro de 2026' });
    expect(periodRange({ kind: 'last30' }, today)).toEqual({ from: '2026-09-20', to: '2026-10-19', label: 'Últimos 30 dias' });
    expect(periodRange({ kind: 'year', year: 2026 }, today)).toEqual({ from: '2026-01-01', to: '2026-12-31', label: '2026' });
  });

  it('orders a custom range typed backwards', () => {
    expect(periodRange({ kind: 'custom', from: '2026-10-10', to: '2026-10-01' }, today)).toEqual({
      from: '2026-10-01',
      to: '2026-10-10',
      label: '01/10/2026 a 10/10/2026',
    });
  });
});
