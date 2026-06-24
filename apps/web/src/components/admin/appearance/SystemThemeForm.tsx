'use client';

import { useMemo, useState } from 'react';
import type { SystemThemeView } from '@next-wiki/shared';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { useTranslation } from '@/i18n/client';
import { SystemThemePreview } from './SystemThemePreview';

export function SystemThemeForm({ initial }: { initial: SystemThemeView }) {
  const { t } = useTranslation();
  const [css, setCss] = useState(initial.css);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const dirty = css !== initial.css;
  const previewCss = useMemo(() => css, [css]);

  async function onSave() {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const response = await fetch('/api/settings/appearance', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ css }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setError(body?.message ?? t('admin.appearance.error.generic'));
        return;
      }
      const data = await response.json();
      setCss(data.css);
      setSaved(true);
    } catch {
      setError(t('admin.appearance.error.generic'));
    } finally {
      setSaving(false);
    }
  }

  function onApplyTemplate(templateCss: string) {
    setCss(templateCss);
    setSaved(false);
  }

  function onClear() {
    setCss('');
  }

  return (
    <div className="grid grid-cols-1 gap-lg lg:grid-cols-2">
      <div className="space-y-sm">
        <p className="text-sm text-muted">{t('admin.appearance.css.hint')}</p>

        <div className="space-y-xs">
          <span className="block text-xs font-medium text-muted">
            {t('admin.appearance.templates.label')}
          </span>
          <div className="flex flex-wrap gap-xs">
            {initial.templates.map((template) => (
              <Button
                key={template.id}
                variant="secondary"
                type="button"
                onClick={() => onApplyTemplate(template.css)}
              >
                {template.name}
              </Button>
            ))}
          </div>
        </div>

        <textarea
          value={css}
          onChange={(e) => setCss(e.target.value)}
          spellCheck={false}
          rows={24}
          className="w-full rounded-md border border-border bg-surface p-md font-mono text-xs focus:outline-none focus:ring-2 focus:ring-primary/50"
          aria-label={t('admin.appearance.css.label')}
        />

        {error && <Alert>{error}</Alert>}
        {saved && (
          <div className="rounded-md bg-primary/10 p-md text-sm text-primary" role="status">
            {t('admin.appearance.saved')}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-sm">
          <Button onClick={onSave} disabled={saving || !dirty}>
            {saving ? t('admin.appearance.saving') : t('admin.appearance.save')}
          </Button>
          <Button variant="ghost" onClick={onClear} disabled={saving || !css}>
            {t('admin.appearance.css.reset')}
          </Button>
        </div>
      </div>

      <div className="lg:sticky lg:top-md lg:self-start">
        <SystemThemePreview css={previewCss} />
      </div>
    </div>
  );
}
