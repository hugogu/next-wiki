'use client';

import { useId, type CSSProperties } from 'react';
import { ProsePreviewSample } from './ProsePreviewSample';
import { useTranslation } from '@/i18n/client';
import {
  COLOR_TOKEN_KEYS,
  FONT_SIZE_KEYS,
  FONT_SLOTS,
} from '@/server/appearance/user-tokens';
import type { UserAppearanceColors, UserAppearanceFonts, UserAppearanceFontSizes } from '@next-wiki/shared';

/** Live preview of the per-user reading theme. The candidate tokens are
 * applied to the preview surface via inline CSS custom properties — the
 * `.prose` sample reads them and updates immediately. */
export function ReadingThemePreview({
  lightColors,
  darkColors,
  fonts,
  fontSizes,
  mode,
  onToggleMode,
  fontCatalog,
}: {
  lightColors: UserAppearanceColors;
  darkColors: UserAppearanceColors;
  fonts: UserAppearanceFonts;
  fontSizes: UserAppearanceFontSizes;
  mode: 'light' | 'dark';
  onToggleMode: (m: 'light' | 'dark') => void;
  fontCatalog: { key: string; stack: string }[];
}) {
  const { t } = useTranslation();
  const scopeId = useId().replace(/[:]/g, '');
  const colors = mode === 'light' ? lightColors : darkColors;
  const stackFor = (key: string) => fontCatalog.find((f) => f.key === key)?.stack ?? '';

  const style: Record<string, string> = {
    backgroundColor: 'var(--color-background)',
    color: 'var(--color-foreground)',
    fontFamily: 'var(--font-body)',
  };
  for (const key of COLOR_TOKEN_KEYS) style[`--color-${key}`] = colors[key] ?? '';
  for (const slot of FONT_SLOTS) {
    const stack = stackFor(fonts[slot]);
    if (stack) style[`--font-${slot}`] = stack;
  }
  for (const key of FONT_SIZE_KEYS) style[`--font-size-${key}`] = fontSizes[key] ?? '';

  return (
    <div className="space-y-sm">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg font-semibold">{t('admin.appearance.preview.title')}</h2>
        <div className="flex overflow-hidden rounded-md border border-border text-xs">
          {(['light', 'dark'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => onToggleMode(m)}
              className={`px-sm py-xs ${mode === m ? 'bg-primary text-primary-text' : 'text-muted hover:text-foreground'}`}
              aria-pressed={mode === m}
            >
              {t(`admin.appearance.preview.${m}`)}
            </button>
          ))}
        </div>
      </div>
      <div
        style={style as CSSProperties}
        className="overflow-hidden rounded-lg border border-border-strong p-md"
        data-reading-theme-preview={scopeId}
      >
        <ProsePreviewSample />
      </div>
    </div>
  );
}
