import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

// Light haptic feedback for important actions (§6). Always optional: it never
// carries meaning on its own, and any failure (web, unsupported device,
// haptics disabled) is silently ignored.

export function tapFeedback(): void {
  if (Platform.OS === 'web') return;
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
}

export function successFeedback(): void {
  if (Platform.OS === 'web') return;
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
}

export function errorFeedback(): void {
  if (Platform.OS === 'web') return;
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => undefined);
}
