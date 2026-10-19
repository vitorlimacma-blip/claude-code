import type { TextStyle } from 'react-native';

// Maré Clara design tokens (briefing §4–6). The base colors are the brief's;
// the complementary ones (borders, focus, pressed, charts, soft surfaces) are
// ours, chosen to pass the contrast checks in `__tests__/contrast.test.ts`.

export interface ColorTokens {
  background: string;
  surface: string;
  /** Inputs, subtle fills and grouped rows inside a surface. */
  surfaceMuted: string;
  textPrimary: string;
  textSecondary: string;
  primary: string;
  onPrimary: string;
  primarySoft: string;
  /** Text and icons on `primarySoft`. */
  onPrimarySoft: string;
  info: string;
  infoSurface: string;
  warning: string;
  warningSurface: string;
  danger: string;
  dangerSurface: string;
  /** Dividers and decorative outlines (not required to reach 3:1). */
  border: string;
  /** Outlines that identify a control, like a text field (3:1 against the surface). */
  borderStrong: string;
  /** Keyboard focus ring. */
  focus: string;
  /** Overlay laid over a pressed control. */
  pressed: string;
  /** Backdrop behind sheets and dialogs. */
  scrim: string;
  /** Money coming in. Paired with a "+" sign, never color alone. */
  amountPositive: string;
  /** Money going out. Neutral on purpose: spending is not a fault (§4: colors that don't judge). */
  amountNegative: string;
  /** Confirmations ("Chave salva"). */
  success: string;
  /** Chart series, in order of use; the first is the main series. */
  chart: [string, string, string, string];
  chartGrid: string;
}

export const lightColors: ColorTokens = {
  background: '#F6F8F5',
  surface: '#FFFFFF',
  surfaceMuted: '#EEF3EF',
  textPrimary: '#132A26',
  textSecondary: '#53645D',
  primary: '#176B5B',
  onPrimary: '#FFFFFF',
  primarySoft: '#DDEEE5',
  onPrimarySoft: '#0F5245',
  info: '#365BB5',
  infoSurface: '#E6ECFA',
  warning: '#8A5200',
  warningSurface: '#FFF1DB',
  danger: '#B42332',
  dangerSurface: '#FDE9EC',
  border: '#DCE4DF',
  borderStrong: '#768982',
  focus: '#365BB5',
  pressed: '#132A2614',
  scrim: '#0A15134D',
  amountPositive: '#176B5B',
  amountNegative: '#132A26',
  success: '#176B5B',
  chart: ['#176B5B', '#365BB5', '#8A5200', '#768982'],
  chartGrid: '#DCE4DF',
};

export const darkColors: ColorTokens = {
  background: '#101A18',
  surface: '#192824',
  surfaceMuted: '#22342F',
  textPrimary: '#F0F6F2',
  textSecondary: '#B3C5BC',
  primary: '#8BD8BD',
  onPrimary: '#10251E',
  primarySoft: '#21423A',
  onPrimarySoft: '#BFEBDB',
  info: '#A9C1F5',
  infoSurface: '#1F2B45',
  warning: '#FFD08A',
  warningSurface: '#382B18',
  danger: '#FFB0B9',
  dangerSurface: '#3A2026',
  border: '#2B3D38',
  borderStrong: '#6F8880',
  focus: '#A9C1F5',
  pressed: '#F0F6F21A',
  scrim: '#00000080',
  amountPositive: '#8BD8BD',
  amountNegative: '#F0F6F2',
  success: '#8BD8BD',
  chart: ['#8BD8BD', '#A9C1F5', '#FFD08A', '#6F8880'],
  chartGrid: '#2B3D38',
};

/** Spacing scale (§5). Screens use 20 of horizontal padding and 24 between sections. */
export const space = { 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32, 10: 40, 12: 48 } as const;
export const SCREEN_PADDING = space[5];
export const SECTION_GAP = space[6];

/**
 * Radii by role: sm for inputs and small badges, md for buttons and rows,
 * lg for cards, xl for sheets, pill for chips.
 */
export const radius = { sm: 8, md: 12, lg: 20, xl: 28, pill: 999 } as const;

/** Minimum touch target (§5). */
export const TOUCH_TARGET = 48;
/** Minimum transaction row height (§5); rows grow with larger text. */
export const ROW_MIN_HEIGHT = 64;

/** Durations in ms and the spring of §6. */
export const motion = {
  press: 100,
  feedback: 160,
  transition: 220,
  sheet: 300,
  spring: { mass: 1, stiffness: 380, damping: 32, overshootClamping: true },
} as const;

/** Font families loaded in `app/_layout.tsx` (Manrope and Inter, SIL OFL 1.1). */
export const fontFamilies = {
  display600: 'Manrope_600SemiBold',
  display700: 'Manrope_700Bold',
  body400: 'Inter_400Regular',
  body500: 'Inter_500Medium',
  body600: 'Inter_600SemiBold',
} as const;

export type TypeRole = 'amountDisplay' | 'screenTitle' | 'sectionTitle' | 'body' | 'bodyStrong' | 'label' | 'caption' | 'amount';

interface RoleSpec {
  family: keyof typeof fontFamilies;
  size: number;
  lineHeight: number;
  weight: TextStyle['fontWeight'];
  tabular?: boolean;
}

/** Type scale of §5. Amounts use Inter with tabular figures so columns of values line up. */
const ROLES: Record<TypeRole, RoleSpec> = {
  amountDisplay: { family: 'body600', size: 36, lineHeight: 42, weight: '600', tabular: true },
  screenTitle: { family: 'display700', size: 28, lineHeight: 34, weight: '700' },
  sectionTitle: { family: 'display600', size: 20, lineHeight: 26, weight: '600' },
  body: { family: 'body400', size: 16, lineHeight: 24, weight: '400' },
  bodyStrong: { family: 'body600', size: 16, lineHeight: 24, weight: '600' },
  label: { family: 'body500', size: 14, lineHeight: 20, weight: '500' },
  /** Auxiliary info only; never for essential financial information. */
  caption: { family: 'body400', size: 12, lineHeight: 16, weight: '400' },
  amount: { family: 'body600', size: 16, lineHeight: 24, weight: '600', tabular: true },
};

/**
 * Text styles per role. With the fonts loaded, each weight is its own family
 * (no fontWeight, which would make Android synthesize bold); without them the
 * system font is used with the equivalent weight.
 */
export function typography(fontsLoaded: boolean): Record<TypeRole, TextStyle> {
  const entries = Object.entries(ROLES).map(([role, spec]) => {
    const style: TextStyle = {
      ...(fontsLoaded ? { fontFamily: fontFamilies[spec.family] } : { fontWeight: spec.weight }),
      fontSize: spec.size,
      lineHeight: spec.lineHeight,
      ...(spec.tabular && { fontVariant: ['tabular-nums'] as TextStyle['fontVariant'] }),
    };
    return [role, style];
  });
  return Object.fromEntries(entries) as Record<TypeRole, TextStyle>;
}
