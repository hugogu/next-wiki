'use client';

import { useId } from 'react';
import { ProsePreviewSample } from './ProsePreviewSample';
import { useTranslation } from '@/i18n/client';

/**
 * Live preview of a Markdown theme. The theme's (in-progress) CSS is applied to
 * the shared prose sample, scoped to this preview surface only via native CSS
 * nesting so it cannot affect the rest of the page. Colors are inherited from
 * the active system theme — the theme controls typography/layout only.
 */
export function MarkdownThemePreview({ css }: { css: string }) {
  const { t } = useTranslation();
  const scopeClass = `mdtp-${useId().replace(/[:]/g, '')}`;
  // `.scope .prose.prose { <theme css> }` → each rule nests under the scope,
  // matching the `.prose.prose` specificity the real injection uses.
  const scopedCss = `.${scopeClass} .prose.prose {\n${css}\n}`;

  return (
    <div className="space-y-sm">
      <h2 className="font-display text-lg font-semibold">{t('admin.appearance.preview.title')}</h2>
      <style dangerouslySetInnerHTML={{ __html: scopedCss }} />
      <div
        className={`${scopeClass} overflow-hidden rounded-lg border border-border-strong p-md`}
        style={{ backgroundColor: 'var(--color-background)', color: 'var(--color-foreground)' }}
        data-md-theme-preview
      >
        <ProsePreviewSample />
      </div>
    </div>
  );
}
