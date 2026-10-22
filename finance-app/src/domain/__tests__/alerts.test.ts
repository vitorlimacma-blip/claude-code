import { buildAlerts, DEFAULT_ALERT_PREFERENCES, planNotifications, pruneDismissed, visibleAlerts, withAlertDefaults, type AlertPreferences } from '../alerts';
import type { BudgetStatus } from '../budgets';
import type { CashProjection } from '../projection';

const today = '2026-10-22';

function projection(partial: Partial<CashProjection> = {}): CashProjection {
  return {
    status: 'ok',
    from: today,
    to: '2026-11-04',
    nextIncome: { date: '2026-11-05', label: 'Salário', amount: 500000 },
    available: 100000,
    availableAccounts: [],
    incomes: [],
    outflows: [],
    variable: null,
    margin: 0,
    lowest: { amount: 50000, date: '2026-11-04' },
    series: [],
    steps: [],
    basis: '',
    limitations: [],
    typical: {} as CashProjection['typical'],
    ...partial,
  };
}

const budget = (partial: Partial<BudgetStatus>): BudgetStatus => ({
  categoryId: 'food',
  categoryName: 'Alimentação',
  budget: 100000,
  spent: 50000,
  committed: 0,
  typicalRemaining: 0,
  projected: 50000,
  level: 'ok',
  method: 'typical',
  ...partial,
});

const outflows: CashProjection['outflows'] = [
  { date: '2026-10-23', label: 'Aluguel', amount: -180000, source: 'recurrence' },
  { date: '2026-10-29', label: 'Internet', amount: -12000, source: 'recurrence' },
  { date: '2026-10-15', label: 'Academia', amount: -9900, source: 'recurrence', overdue: true },
];

describe('buildAlerts', () => {
  it('only bills inside the chosen window, unpaid bills and cash risk, most important first', () => {
    const alerts = buildAlerts({ today, projection: projection({ outflows, lowest: { amount: -3000, date: '2026-10-30' } }), budgets: [], floor: 0, dueWithinDays: 3 });
    expect(alerts.map((a) => a.kind)).toEqual(['cash_risk', 'overdue', 'due']);
    expect(alerts[2].title).toBe('Aluguel vence amanhã');
    expect(alerts.every((a) => a.reason.startsWith('Base:'))).toBe(true);
    const wider = buildAlerts({ today, projection: projection({ outflows }), budgets: [], floor: 0, dueWithinDays: 7 });
    expect(wider.filter((a) => a.kind === 'due')).toHaveLength(2);
  });

  it('cash risk uses the floor the person set, and never fires when the projection is unavailable', () => {
    const p = projection({ lowest: { amount: 20000, date: '2026-10-30' } });
    expect(buildAlerts({ today, projection: p, budgets: [], floor: 0, dueWithinDays: 3 })).toHaveLength(0);
    expect(buildAlerts({ today, projection: p, budgets: [], floor: 50000, dueWithinDays: 3 })[0].title).toMatch(/abaixo do mínimo/);
    expect(buildAlerts({ today, projection: { ...p, status: 'unavailable' }, budgets: [], floor: 50000, dueWithinDays: 3 })).toHaveLength(0);
  });

  it('budget alerts only for overruns, keyed by month and level', () => {
    const alerts = buildAlerts({
      today,
      projection: projection(),
      budgets: [budget({ level: 'warning' }), budget({ categoryId: 'fun', categoryName: 'Lazer', level: 'projected_overrun', projected: 120000 })],
      floor: 0,
      dueWithinDays: 3,
    });
    expect(alerts.map((a) => a.key)).toEqual(['budget:fun:2026-10:projected_overrun']);
  });
});

describe('dismiss and preferences', () => {
  const alerts = buildAlerts({ today, projection: projection({ outflows }), budgets: [], floor: 0, dueWithinDays: 3 });

  it('a dismissed alert stays hidden; turning a kind off hides it', () => {
    const due = alerts.find((a) => a.kind === 'due')!;
    expect(visibleAlerts(alerts, DEFAULT_ALERT_PREFERENCES, { [due.key]: today })).not.toContainEqual(due);
    const prefs = withAlertDefaults({ kinds: { ...DEFAULT_ALERT_PREFERENCES.kinds, overdue: false } });
    expect(visibleAlerts(alerts, prefs, {}).some((a) => a.kind === 'overdue')).toBe(false);
  });

  it('old dismissals are pruned', () => {
    expect(pruneDismissed({ a: '2026-01-01', b: '2026-10-01' }, today)).toEqual({ b: '2026-10-01' });
  });

  it('missing preferences fall back to the defaults', () => {
    expect(withAlertDefaults(null)).toEqual(DEFAULT_ALERT_PREFERENCES);
    expect(withAlertDefaults({ notifications: { enabled: true } as AlertPreferences['notifications'] }).notifications.privateLockScreen).toBe(true);
  });
});

describe('planNotifications', () => {
  const on: AlertPreferences = { ...DEFAULT_ALERT_PREFERENCES, dueWithinDays: 7, notifications: { enabled: true, hour: 9, privateLockScreen: true } };
  const alerts = buildAlerts({ today, projection: projection({ outflows, lowest: { amount: -3000, date: '2026-10-30' } }), budgets: [], floor: 0, dueWithinDays: 7 });

  it('nothing is planned while notifications are off', () => {
    expect(planNotifications(alerts, DEFAULT_ALERT_PREFERENCES, today, 8)).toEqual([]);
  });

  it('one summary a day; bills the day before; private text by default', () => {
    const plan = planNotifications(alerts, on, today, 8);
    expect(plan.map((p) => p.date)).toEqual(['2026-10-22', '2026-10-28']);
    // Today: cash risk + unpaid bill + rent due tomorrow.
    expect(plan[0].body).toBe('Há 3 avisos para olhar no app.');
    expect(plan.every((p) => !/R\$/.test(p.body + p.title))).toBe(true);
  });

  it('after the hour, the first summary moves to tomorrow; names and amounts only when allowed', () => {
    const plan = planNotifications(alerts, { ...on, notifications: { ...on.notifications, privateLockScreen: false } }, today, 10);
    expect(plan[0].date).toBe('2026-10-23');
    expect(plan[0].body).toMatch(/Aluguel vence amanhã \(R\$/);
  });
});
