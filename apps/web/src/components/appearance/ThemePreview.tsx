'use client';

import { useId, useState, type CSSProperties } from 'react';
import { ContentRenderer } from '@/components/renderer/ContentRenderer';
import { useTranslation } from '@/i18n/client';
import { COLOR_TOKEN_KEYS, FONT_SIZE_KEYS, FONT_SLOTS } from '@/server/appearance/user-tokens';

/** Build the CSS custom properties for a preview surface from token values. */
export function buildPreviewVars(
  colors: Record<string, string>,
  fonts: Record<string, string>,
  fontSizes: Record<string, string>,
  fontCatalog: { key: string; stack: string }[],
): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const key of COLOR_TOKEN_KEYS) vars[`--color-${key}`] = colors[key] ?? '';
  for (const slot of FONT_SLOTS) {
    const stack = fontCatalog.find((f) => f.key === fonts[slot])?.stack;
    if (stack) vars[`--font-${slot}`] = stack;
  }
  for (const key of FONT_SIZE_KEYS) vars[`--font-size-${key}`] = fontSizes[key] ?? '';
  return vars;
}

/**
 * Unified live preview for both the per-user reading theme and the admin system
 * theme. Renders a real rendered-Markdown sample (highlighted code, KaTeX math,
 * Mermaid diagram) and applies the active mode's CSS custom properties inline.
 * An optional `injectedCss` (the system theme's draft CSS) is scoped to the
 * preview surface. A Light/Dark switcher toggles which token set applies. The
 * preview neutralizes the globally-active system theme so it reflects only what
 * is being previewed.
 */
export function ThemePreview({
  sampleHtml,
  lightVars,
  darkVars,
  injectedCss,
  initialMode = 'light',
}: {
  sampleHtml: string;
  lightVars: Record<string, string>;
  darkVars: Record<string, string>;
  injectedCss?: string;
  initialMode?: 'light' | 'dark';
}) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<'light' | 'dark'>(initialMode);
  const scopeClass = `tp-${useId().replace(/[:]/g, '')}`;

  const vars = mode === 'light' ? lightVars : darkVars;
  const style: Record<string, string> = {
    backgroundColor: 'var(--color-background)',
    color: 'var(--color-foreground)',
    fontFamily: 'var(--font-body)',
    ...vars,
  };

  // Neutralize the globally-active system theme inside the preview (so it does
  // not inherit e.g. Wiki.js's blockquote card / quote icon), then apply the
  // previewed CSS on top with equal specificity but later source order.
  const isolate =
    `.${scopeClass} .prose.prose blockquote{background-color:transparent;border-radius:0;position:static;min-height:0;overflow:visible;}` +
    `.${scopeClass} .prose.prose blockquote::before{content:none;}` +
    `.${scopeClass} .prose.prose h1,.${scopeClass} .prose.prose h2,.${scopeClass} .prose.prose h3,.${scopeClass} .prose.prose h4{border-bottom-width:0;padding-bottom:0;}`;
  const injected = injectedCss ? `${isolate}\n.${scopeClass} {\n${injectedCss}\n}` : isolate;

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
      <style dangerouslySetInnerHTML={{ __html: injected }} />
      <div
        style={style as CSSProperties}
        className={`${scopeClass} overflow-hidden rounded-lg border border-border-strong p-md`}
        data-theme-preview
      >
        <ContentRenderer html={sampleHtml} />
      </div>
    </div>
  );
}
