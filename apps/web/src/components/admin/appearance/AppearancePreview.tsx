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

const CODE_SAMPLE = `function greet(name) {
  return \`Hello, \${name}\`;
}`;

/**
 * Live sample that applies the in-progress (unsaved) appearance values via
 * locally-scoped CSS custom properties. The body is rendered inside a real
 * `.prose` block so headings, code, blockquotes and tables look exactly like
 * rendered Markdown content — and reflect the configured tokens immediately.
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

  const tableTokens = ['primary', 'background', 'foreground'].filter((k) => tokenKeys.includes(k));

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
        className="overflow-hidden rounded-lg border border-border-strong p-md"
        data-appearance-preview
      >
        <article className="prose max-w-none">
          <h1>{t('admin.appearance.preview.heading')}</h1>
          <p>
            {t('admin.appearance.preview.body')}{' '}
            <a href="#" onClick={(e) => e.preventDefault()}>
              {t('admin.appearance.preview.link')}
            </a>
            .
          </p>

          <h2>{t('admin.appearance.preview.subheading')}</h2>
          <blockquote>{t('admin.appearance.preview.quote')}</blockquote>
          <pre>
            <code>{CODE_SAMPLE}</code>
          </pre>

          <h3>{t('admin.appearance.preview.h3')}</h3>
          <table>
            <thead>
              <tr>
                <th>{t('admin.appearance.preview.table.token')}</th>
                <th>{t('admin.appearance.preview.table.value')}</th>
              </tr>
            </thead>
            <tbody>
              {tableTokens.map((key) => (
                <tr key={key}>
                  <td className="font-mono">{key}</td>
                  <td className="font-mono">{colors[key]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </article>

        {/* Semantic colors not covered by prose */}
        <div className="mt-md flex flex-wrap items-center gap-sm">
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
  );
}
