import { Alert, Platform } from 'react-native';

/**
 * Dialogs that work on every platform: React Native's `Alert` is a no-op on
 * the web, so the browser build uses the native `window.alert/confirm`.
 */
export function notify(title: string, message?: string): void {
  if (Platform.OS === 'web') {
    window.alert(message ? `${title}\n\n${message}` : title);
  } else {
    Alert.alert(title, message);
  }
}

/** Asks for confirmation; resolves true when the user accepts. */
export function confirm(
  title: string,
  message: string,
  options: { confirmLabel?: string; destructive?: boolean } = {}
): Promise<boolean> {
  if (Platform.OS === 'web') return Promise.resolve(window.confirm(`${title}\n\n${message}`));
  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: 'Cancelar', style: 'cancel', onPress: () => resolve(false) },
      {
        text: options.confirmLabel ?? 'OK',
        style: options.destructive ? 'destructive' : 'default',
        onPress: () => resolve(true),
      },
    ]);
  });
}
