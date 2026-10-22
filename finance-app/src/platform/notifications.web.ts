import type { PlannedNotification } from '../domain/alerts';

// The computer version shows alerts inside the app only: no browser notifications.

export const notificationsSupported = false;

export type NotificationPermission = 'granted' | 'denied' | 'undetermined';

export async function notificationPermission(): Promise<NotificationPermission> {
  return 'denied';
}

export async function requestNotificationPermission(): Promise<boolean> {
  return false;
}

export async function replaceScheduledNotifications(_plan: PlannedNotification[]): Promise<void> {}
