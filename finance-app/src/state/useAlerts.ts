import { useCallback, useEffect, useMemo } from 'react';
import { FINANCE_SETTINGS } from '../ai/finance/tools';
import {
  ALERT_DISMISSED_KEY,
  ALERT_PREFERENCES_KEY,
  buildAlerts,
  planNotifications,
  pruneDismissed,
  visibleAlerts,
  withAlertDefaults,
  type AlertPreferences,
  type FinancialAlert,
} from '../domain/alerts';
import type { Cents } from '../domain/types';
import { replaceScheduledNotifications } from '../platform/notifications';
import { useFinancialPicture } from './useFinancialPicture';
import { useQuery } from './useQuery';
import { useRepositories } from './DataProvider';

/** Alert preferences, dismissals and the operating floor, refreshed when settings change. */
export function useAlertSettings() {
  const repos = useRepositories();
  const { data } = useQuery(
    async (r) => ({
      prefs: withAlertDefaults(await r.settings.get<Partial<AlertPreferences> | null>(ALERT_PREFERENCES_KEY, null)),
      dismissed: await r.settings.get<Record<string, string>>(ALERT_DISMISSED_KEY, {}),
      floor: (await r.settings.get<{ amount: Cents } | null>(FINANCE_SETTINGS.operatingFloor, null))?.amount ?? 0,
    }),
    ['settings']
  );
  const savePrefs = useCallback((next: AlertPreferences) => repos.settings.set(ALERT_PREFERENCES_KEY, next), [repos]);
  const saveDismissed = useCallback((next: Record<string, string>) => repos.settings.set(ALERT_DISMISSED_KEY, next), [repos]);
  return { settings: data, savePrefs, saveDismissed };
}

/** Every alert the data supports (before preferences and dismissals), plus what is visible. */
export function useAlerts(): { all: FinancialAlert[]; visible: FinancialAlert[]; dismiss(key: string): Promise<void>; restore(key: string): Promise<void>; restoreAll(): Promise<void>; prefs: AlertPreferences | null } {
  const picture = useFinancialPicture();
  const { settings, saveDismissed } = useAlertSettings();
  const all = useMemo(
    () =>
      picture && settings
        ? buildAlerts({ today: picture.today, projection: picture.projection, budgets: picture.budgets, floor: settings.floor, dueWithinDays: settings.prefs.dueWithinDays })
        : [],
    [picture, settings]
  );
  const visible = useMemo(() => (settings ? visibleAlerts(all, settings.prefs, settings.dismissed) : []), [all, settings]);
  const today = picture?.today;
  const dismiss = useCallback(
    async (key: string) => {
      if (!settings || !today) return;
      await saveDismissed({ ...pruneDismissed(settings.dismissed, today), [key]: today });
    },
    [settings, today, saveDismissed]
  );
  const restore = useCallback(
    async (key: string) => {
      if (!settings) return;
      const { [key]: _removed, ...rest } = settings.dismissed;
      await saveDismissed(rest);
    },
    [settings, saveDismissed]
  );
  const restoreAll = useCallback(() => saveDismissed({}), [saveDismissed]);
  return { all, visible, dismiss, restore, restoreAll, prefs: settings?.prefs ?? null };
}

/** Keeps the phone's scheduled summaries in line with the data and preferences (mounted once, at the root). */
export function NotificationSync() {
  const { visible, prefs } = useAlerts();
  const picture = useFinancialPicture();
  const today = picture?.today;
  const plan = useMemo(() => (prefs && today ? planNotifications(visible, prefs, today, new Date().getHours()) : null), [visible, prefs, today]);
  const planKey = plan ? JSON.stringify(plan) : null;
  useEffect(() => {
    if (plan) void replaceScheduledNotifications(plan);
    // Re-plan only when the plan itself changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planKey]);
  return null;
}
