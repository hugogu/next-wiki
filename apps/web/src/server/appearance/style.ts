import type { UserAppearanceColors, UserAppearanceFonts, UserAppearanceFontSizes } from '@next-wiki/shared';
import { COLOR_TOKEN_KEYS, FONT_SIZE_KEYS, FONT_SLOTS, resolveFontStack } from './user-tokens';

interface UserAppearanceValues {
  lightColors: UserAppearanceColors;
  darkColors: UserAppearanceColors;
  fonts: UserAppearanceFonts;
  fontSizes: UserAppearanceFontSizes;
}

function colorVars(colors: UserAppearanceColors): string {
  return COLOR_TOKEN_KEYS.map((key) => `--color-${key}:${colors[key]};`).join('');
}

function fontVars(fonts: UserAppearanceFonts): string {
  return FONT_SLOTS.map((slot) => {
    const stack = resolveFontStack(fonts[slot]);
    return stack ? `--font-${slot}:${stack};` : '';
  }).join('');
}

function sizeVars(sizes: UserAppearanceFontSizes): string {
  return FONT_SIZE_KEYS.map((key) => `--font-size-${key}:${sizes[key]};`).join('');
}

/**
 * Build the `<style>` body for a user's per-row reading-theme tokens. Light
 * values apply to `.prose.prose`; dark values apply to `html.dark .prose.prose`
 * (specificity 0,2,0 — wins over the static `:root` defaults inside content).
 */
export function buildUserAppearanceCss(values: UserAppearanceValues): string {
  const light = `.prose.prose{${colorVars(values.lightColors)}${fontVars(values.fonts)}${sizeVars(values.fontSizes)}}`;
  const dark = `html.dark .prose.prose{${colorVars(values.darkColors)}}`;
  return `${light}${dark}`;
}
