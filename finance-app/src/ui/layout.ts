import { useWindowDimensions } from 'react-native';

/** Window width from which the app uses the desktop layout (side menu, centered content). */
export const WIDE_BREAKPOINT = 900;

/** Max width of the main content column on wide screens, so text lines stay readable. */
export const CONTENT_MAX_WIDTH = 880;

export function useIsWide(): boolean {
  return useWindowDimensions().width >= WIDE_BREAKPOINT;
}
