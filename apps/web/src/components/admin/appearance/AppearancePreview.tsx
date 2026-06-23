'use client';

import { useState, type CSSProperties } from 'react';
import type { AppearanceSettingsView } from '@next-wiki/shared';
import { useTranslation } from '@/i18n/client';

interface AppearancePreviewProps {
  tokenKeys: string[];
  fontCatalog: AppearanceSettingsView['fontCatalog'];
  lightColors: Record<string, string>;
  darkColors: Record<string, string>;
  fonts: Record<string, string>;
  fontSizes: Record<string, string>;
}

/**
 * Live sample that applies the in-progress (unsaved) appearance values via
 * locally-scoped CSS custom properties, so the admin sees changes immediately
 * without affecting the surrounding page.
 */
export function AppearancePreview({
  tokenKeys,
  fontCatalog,
  lightColors,
  darkColors,
  fonts,
  fontSizes,
}: AppearancePreviewProps) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<'light' | 'dark'>('light');
  const colors = mode === 'light' ? lightColors : darkColors;
  const stackFor = (key: string) => fontCatalog.find((f) => f.key === key)?.stack ?? '';

  const style = {
    backgroundColor: 'var(--color-background)',
    color: 'var(--color-foreground)',
    fontFamily: 'var(--font-body)',
    '--font-body': stackFor(fonts.body ?? ''),
    '--font-display': stackFor(fonts.display ?? ''),
    '--font-mono': stackFor(fonts.mono ?? ''),
  } as Record<string, string>;
  for (const key of tokenKeys) style[`--color-${key}`] = colors[key] ?? '';
  for (const [key, value] of Object.entries(fontSizes)) style[`--font-size-${key}`] = value;

  return (
    <div className="space-y-sm">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg font-semibold">{t('admin.appearance.preview.title')}</h2>
        <div className="flex overflow-hidden rounded-md border border-border text-xs">
          {(['light', 'dark'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
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
        className="overflow-hidden rounded-lg border border-border-strong"
        data-appearance-preview
      >
        <div className="space-y-sm p-md">
          <h1 className="font-display font-semibold" style={{ fontSize: 'var(--font-size-h1)', lineHeight: 1.2 }}>
            {t('admin.appearance.preview.heading')}
          </h1>
          <h2 className="font-display font-semibold" style={{ fontSize: 'var(--font-size-h2)' }}>
            {t('admin.appearance.preview.subheading')}
          </h2>
          <p style={{ fontSize: 'var(--font-size-base)' }}>
            {t('admin.appearance.preview.body')}{' '}
            <a href="#" onClick={(e) => e.preventDefault()} style={{ color: 'var(--color-primary)' }} className="underline">
              {t('admin.appearance.preview.link')}
            </a>
            .
          </p>
          <div
            className="rounded-md border p-sm"
            style={{ backgroundColor: 'var(--color-surface-elevated)', borderColor: 'var(--color-border)' }}
          >
            <code className="font-mono text-sm">{"const theme = 'next-wiki';"}</code>
          </div>
          <p className="text-sm" style={{ color: 'var(--color-muted)' }}>
            {t('admin.appearance.preview.muted')}
          </p>
          <div className="flex items-center gap-sm">
            <span
              className="inline-flex items-center rounded-md px-md py-sm text-sm font-medium"
              style={{ backgroundColor: 'var(--color-primary)', color: 'var(--color-primary-text)' }}
            >
              {t('admin.appearance.preview.button')}
            </span>
            <span className="text-sm font-medium" style={{ color: 'var(--color-danger)' }}>
              {t('admin.appearance.preview.danger')}
            </span>
            <span className="text-sm font-medium" style={{ color: 'var(--color-warning)' }}>
              {t('admin.appearance.preview.warning')}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
