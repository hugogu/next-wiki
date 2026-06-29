'use client';

import { useState } from 'react';
import type { UserAppearanceView } from '@next-wiki/shared';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { useTranslation } from '@/i18n/client';
import { ColorTokenGrid, FontSlotEditors, FontSizeEditors } from '@/components/appearance/TokenEditors';
import { ThemePreview, buildPreviewVars } from '@/components/appearance/ThemePreview';

export function ReadingThemeForm({
  initial,
  sampleHtml,
}: {
  initial: UserAppearanceView;
  sampleHtml: string;
}) {
  const { t } = useTranslation();
  const [lightColors, setLight] = useState({ ...initial.lightColors });
  const [darkColors, setDark] = useState({ ...initial.darkColors });
  const [fonts, setFonts] = useState({ ...initial.fonts });
  const [fontSizes, setFontSizes] = useState({ ...initial.fontSizes });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function onSave() {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const response = await fetch('/api/user/appearance', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ lightColors, darkColors, fonts, fontSizes }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setError(body?.message ?? t('userCenter.readingTheme.error.generic'));
        return;
      }
      setSaved(true);
    } catch {
      setError(t('userCenter.readingTheme.error.generic'));
    } finally {
      setSaving(false);
    }
  }

  async function onReset() {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const response = await fetch('/api/user/appearance', { method: 'DELETE' });
      if (!response.ok) {
        setError(t('userCenter.readingTheme.error.generic'));
        return;
      }
      const data: UserAppearanceView = await response.json();
      setLight({ ...data.lightColors });
      setDark({ ...data.darkColors });
      setFonts({ ...data.fonts });
      setFontSizes({ ...data.fontSizes });
      setSaved(true);
    } catch {
      setError(t('userCenter.readingTheme.error.generic'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid grid-cols-1 gap-lg lg:grid-cols-2">
      <div className="space-y-lg">
        <ColorTokenGrid
          title={t('userCenter.readingTheme.light')}
          colors={lightColors}
          tokenKeys={initial.tokenKeys}
          onChange={setLight}
          labelFor={(k) => k}
        />
        <ColorTokenGrid
          title={t('userCenter.readingTheme.dark')}
          colors={darkColors}
          tokenKeys={initial.tokenKeys}
          onChange={setDark}
          labelFor={(k) => k}
        />
        <section className="space-y-sm">
          <h2 className="font-display text-lg font-semibold">{t('userCenter.readingTheme.fonts')}</h2>
          <FontSlotEditors fonts={fonts} catalog={initial.fontCatalog} onChange={setFonts} />
        </section>
        <section className="space-y-sm">
          <h2 className="font-display text-lg font-semibold">{t('userCenter.readingTheme.sizes')}</h2>
          <FontSizeEditors sizes={fontSizes} onChange={setFontSizes} />
        </section>

        {error && <Alert>{error}</Alert>}
        {saved && (
          <div className="rounded-md bg-primary/10 p-md text-sm text-primary" role="status">
            {t('userCenter.readingTheme.saved')}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-sm">
          <Button onClick={onSave} disabled={saving}>
            {saving ? t('userCenter.readingTheme.saving') : t('userCenter.readingTheme.save')}
          </Button>
          {initial.isCustomized && (
            <Button variant="ghost" onClick={onReset} disabled={saving}>
              {t('userCenter.readingTheme.reset')}
            </Button>
          )}
        </div>
      </div>

      <div className="lg:sticky lg:top-md lg:self-start">
        <ThemePreview
          sampleHtml={sampleHtml}
          lightVars={buildPreviewVars(lightColors, fonts, fontSizes, initial.fontCatalog)}
          darkVars={buildPreviewVars(darkColors, fonts, fontSizes, initial.fontCatalog)}
        />
      </div>
    </div>
  );
}
