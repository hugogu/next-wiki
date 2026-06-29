'use client';

import { useId } from 'react';
import { ProsePreviewSample } from '@/components/appearance/ProsePreviewSample';
import { useTranslation } from '@/i18n/client';

/**
 * Live preview of the admin's system-theme CSS. The candidate CSS is injected
 * into a sandboxed wrapper that renders a small app-shell mock (header,
 * sidebar, button, card) plus the shared `.prose` sample. Colors come from the
 * active reading-theme tokens — the admin's CSS controls layout/structure.
 */
export function SystemThemePreview({ css }: { css: string }) {
  const { t } = useTranslation();
  const scopeClass = `stp-${useId().replace(/[:]/g, '')}`;
  // Neutralize the globally-active system theme inside this preview so it shows
  // ONLY the theme being previewed (e.g. previewing Default while Wiki.js is
  // active must not inherit Wiki.js's blockquote card / quote icon). The
  // previewed CSS below has the same specificity and comes later, so it wins.
  const isolate =
    `.${scopeClass} .prose.prose blockquote{background-color:transparent;border-radius:0;position:static;min-height:0;overflow:visible;}` +
    `.${scopeClass} .prose.prose blockquote::before{content:none;}` +
    `.${scopeClass} .prose.prose h1,.${scopeClass} .prose.prose h2,.${scopeClass} .prose.prose h3,.${scopeClass} .prose.prose h4{border-bottom-width:0;padding-bottom:0;}`;
  const scopedCss = `${isolate}\n.${scopeClass} {\n${css}\n}`;

  return (
    <div className="space-y-sm">
      <h2 className="font-display text-lg font-semibold">{t('admin.appearance.preview.title')}</h2>
      <style dangerouslySetInnerHTML={{ __html: scopedCss }} />
      <div
        className={`${scopeClass} overflow-hidden rounded-lg border border-border-strong p-md`}
        style={{ backgroundColor: 'var(--color-surface)', color: 'var(--color-foreground)' }}
        data-system-theme-preview
      >
        <div className="mb-md flex items-center justify-between border-b border-border pb-sm">
          <span className="font-display text-sm font-semibold">next-wiki</span>
          <span className="rounded-md bg-primary px-md py-xs text-xs text-primary-text">
            {t('admin.appearance.preview.button')}
          </span>
        </div>
        <ProsePreviewSample />
      </div>
    </div>
  );
}
