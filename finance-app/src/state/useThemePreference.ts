import { useCallback, useEffect } from 'react';
import { THEME_PREFERENCES, useThemeState, type ThemePreference } from '../ui/theme';
import { useRepositories } from './DataProvider';

const KEY = 'ui.theme';

/** Theme preference, persisted in settings. */
export function useThemePreference(): [ThemePreference, (preference: ThemePreference) => void] {
  const repos = useRepositories();
  const { preference, setPreference } = useThemeState();
  const update = useCallback(
    (next: ThemePreference) => {
      setPreference(next);
      repos.settings.set(KEY, next).catch(() => undefined);
    },
    [repos, setPreference]
  );
  return [preference, update];
}

/** Loads the saved preference once the database is open. Renders nothing. */
export function ThemePreferenceSync(): null {
  const repos = useRepositories();
  const { setPreference } = useThemeState();
  useEffect(() => {
    repos.settings.get<string>(KEY, 'system').then((saved) => {
      if ((THEME_PREFERENCES as readonly string[]).includes(saved)) setPreference(saved as ThemePreference);
    }, () => undefined);
  }, [repos, setPreference]);
  return null;
}
