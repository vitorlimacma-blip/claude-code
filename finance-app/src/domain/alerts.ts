import type { BudgetStatus } from './budgets';
import { addDaysToDateKey, formatDateBR } from './dates';
import { formatCents } from './money';
import type { CashProjection } from './projection';
import type { Cents, DateKey } from './types';

// Alerts (briefing §13): only what matters — bills due soon, bills that look
// unpaid, cash risk before the next income and significant budget deviations.
// Each has a stable key (dedupe and dismiss), the reason and a possible action.
// Notifications are at most one summary a day, and on the lock screen they
// show no amounts or names unless the person allows it.

export type AlertKind = 'cash_risk' | 'overdue' | 'due' | 'budget';

export interface FinancialAlert {
  /** Stable while the situation is the same: a dismissed key stays hidden; next month's bill is a new key. */
  key: string;
  kind: AlertKind;
  /** The day it is about (due date, lowest balance day). */
  date: DateKey;
  title: string;
  body: string;
  /** Why the app is saying this. */
  reason: string;
  action: { label: string; target: 'recurrences' | 'transactions' | 'goals'; categoryId?: string };
  severity: 'attention' | 'info';
  /** Short text for a notification that may show names and amounts. */
  detail: string;
}

export interface AlertPreferences {
  kinds: Record<AlertKind, boolean>;
  /** How many days ahead a bill becomes an alert. */
  dueWithinDays: 1 | 3 | 7;
  notifications: {
    enabled: boolean;
    /** Local hour of the daily summary. */
    hour: number;
    /** Lock screen shows only "there are N alerts" (default). */
    privateLockScreen: boolean;
  };
}

export const ALERT_PREFERENCES_KEY = 'alerts.preferences';
export const ALERT_DISMISSED_KEY = 'alerts.dismissed';

export const DEFAULT_ALERT_PREFERENCES: AlertPreferences = {
  kinds: { cash_risk: true, overdue: true, due: true, budget: true },
  dueWithinDays: 3,
  notifications: { enabled: false, hour: 9, privateLockScreen: true },
};

export function withAlertDefaults(saved: Partial<AlertPreferences> | null): AlertPreferences {
  return {
    ...DEFAULT_ALERT_PREFERENCES,
    ...saved,
    kinds: { ...DEFAULT_ALERT_PREFERENCES.kinds, ...saved?.kinds },
    notifications: { ...DEFAULT_ALERT_PREFERENCES.notifications, ...saved?.notifications },
  };
}

const ORDER: Record<AlertKind, number> = { cash_risk: 0, overdue: 1, due: 2, budget: 3 };

/** Every alert the data supports today, most important first, before preferences and dismissals. */
export function buildAlerts(input: {
  today: DateKey;
  projection: CashProjection;
  budgets: BudgetStatus[];
  /** Operating floor the person set (0 when none). */
  floor: Cents;
  dueWithinDays: number;
}): FinancialAlert[] {
  const { today, projection, budgets, floor } = input;
  const out: FinancialAlert[] = [];
  const month = today.slice(0, 7);

  if (projection.status !== 'unavailable' && projection.lowest.amount < floor) {
    const below = floor > 0 ? `abaixo do saldo mínimo de ${formatCents(floor)}` : 'negativo';
    out.push({
      key: `cash_risk:${projection.to}`,
      kind: 'cash_risk',
      date: projection.lowest.date,
      title: `O saldo pode ficar ${floor > 0 ? 'abaixo do mínimo' : 'negativo'} antes do recebimento`,
      body: `Pela previsão, o disponível chega a ${formatCents(projection.lowest.amount)} em ${formatDateBR(projection.lowest.date)}, ${below}.`,
      reason: 'Base: saldo atual sem as reservas, contas previstas, faturas e gasto variável típico até o próximo recebimento.',
      action: { label: 'Ver contas previstas', target: 'recurrences' },
      severity: 'attention',
      detail: `Previsão de saldo ${formatCents(projection.lowest.amount)} em ${formatDateBR(projection.lowest.date)}`,
    });
  }

  for (const e of projection.outflows) {
    if (e.overdue) {
      out.push({
        key: `overdue:${e.source}:${e.label}:${e.date}`,
        kind: 'overdue',
        date: e.date,
        title: `${e.label}: previsto para ${formatDateBR(e.date)} e sem lançamento`,
        body: `Valor previsto: ${formatCents(-e.amount)}. Se já pagou, registre o lançamento; se não, ainda dá tempo de olhar.`,
        reason: 'Base: suas contas previstas sem um lançamento correspondente.',
        action: { label: 'Ver contas previstas', target: 'recurrences' },
        severity: 'attention',
        detail: `${e.label} (${formatCents(-e.amount)}) sem lançamento`,
      });
    } else if (e.date >= today && e.date <= addDaysToDateKey(today, input.dueWithinDays)) {
      const when = e.date === today ? 'hoje' : e.date === addDaysToDateKey(today, 1) ? 'amanhã' : `em ${formatDateBR(e.date)}`;
      out.push({
        key: `due:${e.source}:${e.label}:${e.date}`,
        kind: 'due',
        date: e.date,
        title: `${e.label} vence ${when}`,
        body: `Valor previsto: ${formatCents(-e.amount)}. Quando pagar, registre o lançamento para ele sair dos compromissos.`,
        reason: e.source === 'invoice' ? 'Base: compras registradas nessa fatura menos pagamentos.' : 'Base: suas contas previstas.',
        action: { label: 'Ver contas previstas', target: 'recurrences' },
        severity: 'info',
        detail: `${e.label} vence ${when} (${formatCents(-e.amount)})`,
      });
    }
  }

  for (const b of budgets) {
    if (b.level !== 'exceeded' && b.level !== 'projected_overrun') continue;
    const exceeded = b.level === 'exceeded';
    out.push({
      key: `budget:${b.categoryId}:${month}:${b.level}`,
      kind: 'budget',
      date: today,
      title: exceeded ? `${b.categoryName} passou do orçamento` : `${b.categoryName} pode passar do orçamento`,
      body: exceeded
        ? `Gasto até agora ${formatCents(b.spent)} de ${formatCents(b.budget)}.`
        : `Gasto até agora ${formatCents(b.spent)} de ${formatCents(b.budget)}; previsão para o mês ${formatCents(b.projected)}.`,
      reason:
        b.method === 'typical'
          ? 'Base: gasto até hoje, contas previstas e o restante de um mês típico.'
          : 'Base: gasto até hoje e contas previstas (sem histórico para estimar o resto).',
      action: { label: 'Ver lançamentos', target: 'transactions', categoryId: b.categoryId },
      severity: 'info',
      detail: exceeded ? `${b.categoryName} passou do orçamento` : `${b.categoryName} pode passar do orçamento`,
    });
  }

  return out.sort((a, b) => ORDER[a.kind] - ORDER[b.kind] || a.date.localeCompare(b.date));
}

/** What the person sees: kinds turned on and not dismissed. */
export function visibleAlerts(alerts: FinancialAlert[], prefs: AlertPreferences, dismissed: Record<string, string>): FinancialAlert[] {
  return alerts.filter((a) => prefs.kinds[a.kind] && !dismissed[a.key]);
}

/** Drops dismissals older than 90 days (their situations are long gone). */
export function pruneDismissed(dismissed: Record<string, string>, today: DateKey): Record<string, string> {
  const limit = addDaysToDateKey(today, -90);
  return Object.fromEntries(Object.entries(dismissed).filter(([, day]) => day >= limit));
}

export interface PlannedNotification {
  id: string;
  date: DateKey;
  hour: number;
  title: string;
  body: string;
}

/** Days ahead the app schedules summaries for (it re-plans every time it opens). */
export const NOTIFICATION_HORIZON_DAYS = 7;

/**
 * At most one summary a day. A bill is announced the day before it is due
 * (or on the day, if that's the first slot); cash risk and unpaid bills in the
 * first slot. Budget deviations stay in the app.
 */
export function planNotifications(alerts: FinancialAlert[], prefs: AlertPreferences, today: DateKey, currentHour: number): PlannedNotification[] {
  if (!prefs.notifications.enabled) return [];
  const hour = prefs.notifications.hour;
  const firstSlot = currentHour < hour ? today : addDaysToDateKey(today, 1);
  const byDay = new Map<DateKey, FinancialAlert[]>();
  const add = (day: DateKey, a: FinancialAlert) => byDay.set(day, [...(byDay.get(day) ?? []), a]);
  for (const a of alerts) {
    if (!prefs.kinds[a.kind]) continue;
    if (a.kind === 'cash_risk' || a.kind === 'overdue') add(firstSlot, a);
    else if (a.kind === 'due') {
      const before = addDaysToDateKey(a.date, -1);
      const day = before >= firstSlot ? before : a.date >= firstSlot ? a.date : null;
      if (day) add(day, a);
    }
  }
  const last = addDaysToDateKey(today, NOTIFICATION_HORIZON_DAYS);
  return [...byDay.entries()]
    .filter(([day]) => day <= last)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, list]) => ({
      id: `summary:${day}`,
      date: day,
      hour,
      title: 'Avisos das suas finanças',
      body: prefs.notifications.privateLockScreen
        ? `${list.length === 1 ? 'Há 1 aviso' : `Há ${list.length} avisos`} para olhar no app.`
        : list.map((a) => a.detail).join(' · '),
    }));
}
