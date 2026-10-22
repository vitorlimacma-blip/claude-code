import { composite, ensureContrast, MIN_CONTRAST, withAlpha } from './contrast';

/** Opacity of a category or institution color behind its icon. */
export const CATEGORY_TINT_ALPHA = 0.14;

/**
 * Colors for a category/institution bubble drawn on `surface`. These colors
 * come from data (some chosen by the user), so the icon tint is adjusted until
 * it reaches 3:1 on the bubble in the current theme.
 */
export function categoryTint(color: string, surface: string): { bubble: string; icon: string } {
  const bubble = composite(withAlpha(color, CATEGORY_TINT_ALPHA), surface);
  return { bubble, icon: ensureContrast(color, bubble, MIN_CONTRAST.graphic) };
}
