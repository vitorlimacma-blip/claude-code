/**
 * Web/desktop fallback for secrets: browsers have no keychain API, so keys go
 * to this site's localStorage. Acceptable for a personal app on one's own
 * computer; the commercial version keeps provider keys on a server instead.
 */
const PREFIX = 'secret:';

export const secrets = {
  async get(key: string): Promise<string | null> {
    try {
      return globalThis.localStorage?.getItem(PREFIX + key) ?? null;
    } catch {
      return null;
    }
  },
  async set(key: string, value: string | null): Promise<void> {
    if (value) globalThis.localStorage?.setItem(PREFIX + key, value);
    else globalThis.localStorage?.removeItem(PREFIX + key);
  },
  isSecure: false,
};
