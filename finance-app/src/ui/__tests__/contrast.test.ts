import { DEFAULT_CATEGORIES } from '../../domain/defaultCategories';
import { INSTITUTIONS } from '../../domain/institutions';
import { composite, contrastRatio, ensureContrast, MIN_CONTRAST, withAlpha } from '../contrast';
import { CATEGORY_TINT_ALPHA } from '../categoryColor';
import { buildTheme, resolveDark } from '../theme';
import { darkColors, lightColors, type ColorTokens } from '../tokens';

describe('contrast math', () => {
  it('matches known WCAG values', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 5);
    expect(contrastRatio('#FFFFFF', '#FFFFFF')).toBeCloseTo(1, 5);
    expect(contrastRatio('#777777', '#FFFFFF')).toBeCloseTo(4.48, 2);
  });

  it('composites translucent colors before measuring', () => {
    expect(composite('#00000080', '#FFFFFF')).toBe('#7F7F7F');
    // Half-transparent black text on white is much weaker than solid black.
    expect(contrastRatio('#00000080', '#FFFFFF')).toBeLessThan(4.5);
  });

  it('ensureContrast keeps passing colors and darkens or lightens failing ones', () => {
    expect(ensureContrast('#176B5B', '#FFFFFF', 4.5)).toBe('#176B5B');
    const fixed = ensureContrast('#FACC15', '#FFFFFF', 3);
    expect(contrastRatio(fixed, '#FFFFFF')).toBeGreaterThanOrEqual(3);
    const onDark = ensureContrast('#1E3A8A', '#192824', 3);
    expect(contrastRatio(onDark, '#192824')).toBeGreaterThanOrEqual(3);
  });
});

/**
 * Every foreground/background pair the components actually draw, with the
 * minimum it must reach (§6: 4.5 for text, 3 for large text and essential graphics).
 */
function usedPairs(c: ColorTokens): [string, string, string, number][] {
  const text = MIN_CONTRAST.text;
  const graphic = MIN_CONTRAST.graphic;
  const pairs: [string, string, string, number][] = [];
  for (const [bgName, bg] of [
    ['background', c.background],
    ['surface', c.surface],
    ['surfaceMuted', c.surfaceMuted],
  ] as const) {
    pairs.push([`textPrimary on ${bgName}`, c.textPrimary, bg, text]);
    pairs.push([`textSecondary on ${bgName}`, c.textSecondary, bg, text]);
    pairs.push([`primary (links, secondary buttons) on ${bgName}`, c.primary, bg, text]);
    pairs.push([`amountPositive on ${bgName}`, c.amountPositive, bg, text]);
    pairs.push([`amountNegative on ${bgName}`, c.amountNegative, bg, text]);
    pairs.push([`danger text on ${bgName}`, c.danger, bg, text]);
    pairs.push([`info text on ${bgName}`, c.info, bg, text]);
    pairs.push([`borderStrong (field outline) on ${bgName}`, c.borderStrong, bg, graphic]);
    pairs.push([`focus ring on ${bgName}`, c.focus, bg, graphic]);
    c.chart.forEach((series, i) => pairs.push([`chart series ${i} on ${bgName}`, series, bg, graphic]));
  }
  pairs.push(['onPrimary on primary (buttons)', c.onPrimary, c.primary, text]);
  pairs.push(['onPrimary on primary + pressed overlay', c.onPrimary, composite(c.pressed, c.primary), text]);
  pairs.push(['onPrimarySoft on primarySoft (selected chips)', c.onPrimarySoft, c.primarySoft, text]);
  pairs.push(['textPrimary on primarySoft', c.textPrimary, c.primarySoft, text]);
  pairs.push(['toast: background on textPrimary', c.background, c.textPrimary, text]);
  pairs.push(['warning on warningSurface', c.warning, c.warningSurface, text]);
  pairs.push(['danger on dangerSurface', c.danger, c.dangerSurface, text]);
  pairs.push(['info on infoSurface', c.info, c.infoSurface, text]);
  pairs.push(['textPrimary on warningSurface', c.textPrimary, c.warningSurface, text]);
  pairs.push(['textPrimary on dangerSurface', c.textPrimary, c.dangerSurface, text]);
  pairs.push(['textPrimary on surface + pressed overlay', c.textPrimary, composite(c.pressed, c.surface), text]);
  pairs.push(['textSecondary on surface + pressed overlay', c.textSecondary, composite(c.pressed, c.surface), text]);
  pairs.push(['primary on primarySoft (progress fill on track)', c.primary, c.primarySoft, graphic]);
  pairs.push(['warning on primarySoft (budget over, fill on track)', c.warning, c.primarySoft, graphic]);
  pairs.push(['textPrimary on primarySoft (projection marker)', c.textPrimary, c.primarySoft, graphic]);
  pairs.push(['danger button text', c.onPrimary === '#FFFFFF' ? '#FFFFFF' : c.background, c.danger, text]);
  return pairs;
}

describe.each([
  ['light', lightColors],
  ['dark', darkColors],
])('Maré Clara %s theme', (_name, colors) => {
  it.each(usedPairs(colors))('%s', (_label, fg, bg, min) => {
    expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(min);
  });

  it('category and institution colors stay legible as icon tints on their bubbles (after ensureContrast)', () => {
    const palette = new Set<string>();
    for (const kind of ['expense', 'income'] as const) for (const c of DEFAULT_CATEGORIES[kind]) palette.add(c.color);
    for (const i of INSTITUTIONS) palette.add(i.color);
    for (const surface of [colors.surface, colors.background]) {
      for (const color of palette) {
        const bubble = composite(withAlpha(color, CATEGORY_TINT_ALPHA), surface);
        const tint = ensureContrast(color, bubble, MIN_CONTRAST.graphic);
        expect(contrastRatio(tint, bubble)).toBeGreaterThanOrEqual(MIN_CONTRAST.graphic);
      }
    }
  });
});

describe('theme preference', () => {
  it('follows the system unless the user picked a theme', () => {
    expect(resolveDark('system', 'dark')).toBe(true);
    expect(resolveDark('system', 'light')).toBe(false);
    expect(resolveDark('system', null)).toBe(false);
    expect(resolveDark('light', 'dark')).toBe(false);
    expect(resolveDark('dark', 'light')).toBe(true);
  });

  it('uses Manrope/Inter when loaded and the system font with weights otherwise; amounts use tabular figures', () => {
    expect(buildTheme(false, true).type.screenTitle).toMatchObject({ fontFamily: 'Manrope_700Bold', fontSize: 28, lineHeight: 34 });
    expect(buildTheme(false, false).type.screenTitle).toMatchObject({ fontWeight: '700', fontSize: 28 });
    expect(buildTheme(true, true).type.amountDisplay.fontVariant).toEqual(['tabular-nums']);
  });
});
