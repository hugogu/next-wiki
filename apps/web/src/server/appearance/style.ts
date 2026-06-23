import type { AppearanceColors, AppearanceFonts, AppearanceFontSizes } from '@next-wiki/shared';
import { COLOR_TOKEN_KEYS, FONT_SIZE_KEYS, FONT_SLOTS, resolveFontStack } from './tokens';

interface AppearanceValues {
  lightColors: AppearanceColors;
  darkColors: AppearanceColors;
  fonts: AppearanceFonts;
  fontSizes: AppearanceFontSizes;
}

function colorVars(colors: AppearanceColors): string {
  return COLOR_TOKEN_KEYS.map((key) => `--color-${key}:${colors[key]};`).join('');
}

function fontVars(fonts: AppearanceFonts): string {
  return FONT_SLOTS.map((slot) => {
    const stack = resolveFontStack(fonts[slot]);
    return stack ? `--font-${slot}:${stack};` : '';
  }).join('');
}

function sizeVars(sizes: AppearanceFontSizes): string {
  return FONT_SIZE_KEYS.map((key) => `--font-size-${key}:${sizes[key]};`).join('');
}

/**
 * Build the `<style>` body that overrides the static design tokens with the
 * admin-configured appearance. Light colors + fonts + sizes apply to `:root`;
 * dark colors apply to `html.dark` (research R1). Fonts/sizes are mode-neutral.
 */
export function buildAppearanceStyleCss(values: AppearanceValues): string {
  const root = `:root{${colorVars(values.lightColors)}${fontVars(values.fonts)}${sizeVars(values.fontSizes)}}`;
  const dark = `html.dark{${colorVars(values.darkColors)}}`;
  return `${root}${dark}`;
}
