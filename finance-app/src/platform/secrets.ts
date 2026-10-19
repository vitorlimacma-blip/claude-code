import * as SecureStore from 'expo-secure-store';

/**
 * Small secrets (API keys) on iOS/Android: stored in the iOS Keychain /
 * Android Keystore, never in the SQLite database or in backups.
 * The web build uses `secrets.web.ts` instead.
 */
export const secrets = {
  async get(key: string): Promise<string | null> {
    return SecureStore.getItemAsync(key);
  },
  async set(key: string, value: string | null): Promise<void> {
    if (value) await SecureStore.setItemAsync(key, value);
    else await SecureStore.deleteItemAsync(key);
  },
  /** Whether secrets are protected by the operating system on this platform. */
  isSecure: true,
};
