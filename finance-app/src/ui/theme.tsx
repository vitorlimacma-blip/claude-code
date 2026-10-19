import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import type { AlertLevel } from '../domain/types';
import {
  darkColors,
  lightColors,
  motion,
  radius,
  space,
  typography,
  type ColorTokens,
  type TypeRole,
} from './tokens';
import type { TextStyle } from 'react-native';

export const THEME_PREFERENCES = ['system', 'light', 'dark'] as const;
export type ThemePreference = (typeof THEME_PREFERENCES)[number];

export interface Theme {
  dark: boolean;
  colors: ColorTokens;
  type: Record<TypeRole, TextStyle>;
  space: typeof space;
  radius: typeof radius;
  motion: typeof motion;
  /** Budget situations: tinted surface plus text, always with a written label (never color alone). */
  alert: Record<AlertLevel, { bg: string; fg: string }>;
}

export function resolveDark(preference: ThemePreference, system: 'light' | 'dark' | null | undefined): boolean {
  return preference === 'dark' || (preference === 'system' && system === 'dark');
}

export function buildTheme(dark: boolean, fontsLoaded: boolean): Theme {
  const colors = dark ? darkColors : lightColors;
  return {
    dark,
    colors,
    type: typography(fontsLoaded),
    space,
    radius,
    motion,
    alert: {
      ok: { bg: colors.primarySoft, fg: colors.onPrimarySoft },
      warning: { bg: colors.warningSurface, fg: colors.warning },
      projected_overrun: { bg: colors.warningSurface, fg: colors.warning },
      exceeded: { bg: colors.dangerSurface, fg: colors.danger },
    },
  };
}

interface ThemeState {
  theme: Theme;
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => void;
}

const fallback: ThemeState = { theme: buildTheme(false, false), preference: 'system', setPreference: () => undefined };
const ThemeContext = createContext<ThemeState>(fallback);

/**
 * Provides the Maré Clara theme. The preference (system, light or dark) is
 * held here and persisted by `ThemePreferenceSync`, which lives inside the
 * data layer; until it loads, the system setting is used.
 */
export function ThemeProvider({ children, fontsLoaded }: { children: ReactNode; fontsLoaded: boolean }) {
  const system = useColorScheme();
  const [preference, setPreference] = useState<ThemePreference>('system');
  const dark = resolveDark(preference, system);
  const value = useMemo(
    () => ({ theme: buildTheme(dark, fontsLoaded), preference, setPreference }),
    [dark, fontsLoaded, preference]
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  return useContext(ThemeContext).theme;
}

/** Current preference and its in-memory setter (use `useThemePreference` to also persist it). */
export function useThemeState(): ThemeState {
  return useContext(ThemeContext);
}
