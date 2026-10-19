import { useColorScheme } from 'react-native';
import type { AlertLevel } from '../domain/types';

export interface Theme {
  dark: boolean;
  colors: {
    background: string;
    surface: string;
    surfaceMuted: string;
    border: string;
    text: string;
    textMuted: string;
    primary: string;
    onPrimary: string;
    positive: string;
    negative: string;
    danger: string;
  };
  alert: Record<AlertLevel, { bg: string; fg: string }>;
  radius: { sm: number; md: number; lg: number; pill: number };
  spacing: (n: number) => number;
}

const shared = {
  radius: { sm: 8, md: 12, lg: 16, pill: 999 },
  spacing: (n: number) => n * 4,
};

export const lightTheme: Theme = {
  ...shared,
  dark: false,
  colors: {
    background: '#F3F4F6',
    surface: '#FFFFFF',
    surfaceMuted: '#F9FAFB',
    border: '#E5E7EB',
    text: '#111827',
    textMuted: '#6B7280',
    primary: '#2563EB',
    onPrimary: '#FFFFFF',
    positive: '#15803D',
    negative: '#B91C1C',
    danger: '#DC2626',
  },
  alert: {
    ok: { bg: '#DCFCE7', fg: '#166534' },
    warning: { bg: '#FEF9C3', fg: '#854D0E' },
    projected_overrun: { bg: '#FFEDD5', fg: '#9A3412' },
    exceeded: { bg: '#FEE2E2', fg: '#991B1B' },
  },
};

export const darkTheme: Theme = {
  ...shared,
  dark: true,
  colors: {
    background: '#0B0F17',
    surface: '#161B26',
    surfaceMuted: '#1F2533',
    border: '#2A3140',
    text: '#F3F4F6',
    textMuted: '#9CA3AF',
    primary: '#60A5FA',
    onPrimary: '#0B0F17',
    positive: '#4ADE80',
    negative: '#F87171',
    danger: '#F87171',
  },
  alert: {
    ok: { bg: '#14532D', fg: '#BBF7D0' },
    warning: { bg: '#713F12', fg: '#FEF08A' },
    projected_overrun: { bg: '#7C2D12', fg: '#FED7AA' },
    exceeded: { bg: '#7F1D1D', fg: '#FECACA' },
  },
};

/** The theme matching the phone's light/dark setting. */
export function useTheme(): Theme {
  return useColorScheme() === 'dark' ? darkTheme : lightTheme;
}
