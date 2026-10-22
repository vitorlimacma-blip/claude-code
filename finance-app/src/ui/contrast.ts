// WCAG 2.x contrast math, used by the tests that validate the theme and by
// components that draw user-chosen colors (category colors) on theme surfaces.

export interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

/** Parses #RGB, #RRGGBB or #RRGGBBAA. */
export function parseHex(hex: string): Rgba {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? [...h].map((c) => c + c).join('') : h;
  if (!/^[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/.test(full)) throw new Error(`Invalid color: ${hex}`);
  const n = (i: number) => parseInt(full.slice(i, i + 2), 16);
  return { r: n(0), g: n(2), b: n(4), a: full.length === 8 ? n(6) / 255 : 1 };
}

export function toHex({ r, g, b }: Rgba): string {
  const c = (v: number) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`.toUpperCase();
}

/** Color with an alpha channel, as #RRGGBBAA (React Native and the web both accept it). */
export function withAlpha(hex: string, alpha: number): string {
  const a = Math.round(Math.min(1, Math.max(0, alpha)) * 255)
    .toString(16)
    .padStart(2, '0');
  return `${toHex(parseHex(hex))}${a}`.toUpperCase();
}

/** What a translucent color looks like over an opaque background. */
export function composite(fg: string, bg: string): string {
  const f = parseHex(fg);
  const b = parseHex(bg);
  const mix = (x: number, y: number) => x * f.a + y * (1 - f.a);
  return toHex({ r: mix(f.r, b.r), g: mix(f.g, b.g), b: mix(f.b, b.b), a: 1 });
}

function channel(v: number): number {
  const s = v / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(hex: string): number {
  const { r, g, b } = parseHex(hex);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/**
 * Contrast ratio (1 to 21) of `fg` drawn on `bg`. Translucent colors are first
 * composited: `fg` over `bg`, and `bg` over `base` (the surface underneath).
 */
export function contrastRatio(fg: string, bg: string, base = '#FFFFFF'): number {
  const background = composite(bg, base);
  const foreground = composite(fg, background);
  const [l1, l2] = [relativeLuminance(foreground), relativeLuminance(background)].sort((a, b) => b - a);
  return (l1 + 0.05) / (l2 + 0.05);
}

/** Reference minimums from briefing §6. */
export const MIN_CONTRAST = { text: 4.5, largeText: 3, graphic: 3 } as const;

/**
 * Returns `color`, or the closest shade of it (mixed toward black or white,
 * whichever direction gains contrast) that reaches `min` against `bg`.
 * Used for colors the user picks, which the theme can't vouch for.
 */
export function ensureContrast(color: string, bg: string, min: number): string {
  if (contrastRatio(color, bg) >= min) return toHex(parseHex(color));
  const c = parseHex(color);
  const target = relativeLuminance(composite(bg, '#FFFFFF')) > 0.5 ? 0 : 255;
  for (let step = 1; step <= 20; step++) {
    const t = step / 20;
    const candidate = toHex({
      r: c.r + (target - c.r) * t,
      g: c.g + (target - c.g) * t,
      b: c.b + (target - c.b) * t,
      a: 1,
    });
    if (contrastRatio(candidate, bg) >= min) return candidate;
  }
  return target === 0 ? '#000000' : '#FFFFFF';
}
