import * as Notifications from 'expo-notifications';
import type { PlannedNotification } from '../domain/alerts';
import { logError } from './errors';

// Local notifications on the phone (no push server, nothing leaves the device).
// The app re-plans the daily summaries every time the data or the preferences
// change, replacing whatever it scheduled before.

export const notificationsSupported = true;

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
});

export type NotificationPermission = 'granted' | 'denied' | 'undetermined';

export async function notificationPermission(): Promise<NotificationPermission> {
  const { status } = await Notifications.getPermissionsAsync();
  return status === 'granted' ? 'granted' : status === 'denied' ? 'denied' : 'undetermined';
}

/** Asked only when the person turns notifications on (briefing §13: in the context of the benefit). */
export async function requestNotificationPermission(): Promise<boolean> {
  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

export async function replaceScheduledNotifications(plan: PlannedNotification[]): Promise<void> {
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
    if ((await notificationPermission()) !== 'granted') return;
    const now = Date.now();
    for (const n of plan) {
      const [y, m, d] = n.date.split('-').map(Number);
      const at = new Date(y, m - 1, d, n.hour, 0, 0);
      if (at.getTime() <= now) continue;
      await Notifications.scheduleNotificationAsync({
        identifier: n.id,
        content: { title: n.title, body: n.body },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: at },
      });
    }
  } catch (error) {
    logError('notifications.schedule', error);
  }
}
