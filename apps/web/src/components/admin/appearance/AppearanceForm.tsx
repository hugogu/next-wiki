'use client';

import { useState } from 'react';
import type { AppearanceSettingsView } from '@next-wiki/shared';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Alert } from '@/components/ui/Alert';
import { useTranslation } from '@/i18n/client';
import { AppearancePreview } from './AppearancePreview';

type Mode = 'lightColors' | 'darkColors';

/** A single color token row: native color picker + free-text field (for rgba/hsl). */
function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
}) {
  const swatch = /^#[0-9a-fA-F]{6}$/.test(value) ? value : '#000000';
  return (
    <label className="flex items-center justify-between gap-sm text-sm">
      <span className="font-mono text-xs text-muted">{label.split(' ').slice(1).join(' ')}</span>
      <span className="flex items-center gap-xs">
        <input
          type="color"
          value={swatch}
          onChange={(e) => onChange(e.target.value)}
          aria-label={`${label} swatch`}
          className="h-7 w-8 shrink-0 cursor-pointer rounded border border-border bg-surface p-0"
        />
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="max-w-[9rem] font-mono"
          aria-label={label}
        />
      </span>
    </label>
  );
}

export function AppearanceForm({ initial }: { initial: AppearanceSettingsView }) {
  const { t } = useTranslation();
  const [lightColors, setLight] = useState({ ...initial.lightColors });
  const [darkColors, setDark] = useState({ ...initial.darkColors });
  const [fonts, setFonts] = useState({ ...initial.fonts });
  const [fontSizes, setFontSizes] = useState({ ...initial.fontSizes });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const setColor = (mode: Mode, key: string, value: string) => {
    const setter = mode === 'lightColors' ? setLight : setDark;
    setter((prev) => ({ ...prev, [key]: value }));
  };

  async function onSave() {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const response = await fetch('/api/settings/appearance', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ lightColors, darkColors, fonts, fontSizes }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setError(body?.message ?? t('admin.appearance.error.generic'));
        return;
      }
      setSaved(true);
    } catch {
      setError(t('admin.appearance.error.generic'));
    } finally {
      setSaving(false);
    }
  }

  const colorRows = (mode: Mode, colors: Record<string, string>) => (
    <div className="grid grid-cols-1 gap-xs sm:grid-cols-2">
      {initial.tokenKeys.map((key) => (
        <ColorField
          key={`${mode}-${key}`}
          label={`${mode === 'lightColors' ? 'lightColors' : 'darkColors'} ${key}`}
          value={colors[key] ?? ''}
          onChange={(next) => setColor(mode, key, next)}
        />
      ))}
    </div>
  );

  return (
    <div className="grid grid-cols-1 gap-lg lg:grid-cols-2">
      {/* Left: editors */}
      <div className="space-y-lg">
        <section className="space-y-sm">
          <h2 className="font-display text-lg font-semibold">{t('admin.appearance.colors.light')}</h2>
          {colorRows('lightColors', lightColors)}
        </section>

        <section className="space-y-sm">
          <h2 className="font-display text-lg font-semibold">{t('admin.appearance.colors.dark')}</h2>
          {colorRows('darkColors', darkColors)}
        </section>

        <section className="space-y-sm">
          <h2 className="font-display text-lg font-semibold">{t('admin.appearance.fonts.title')}</h2>
          <div className="grid grid-cols-1 gap-sm sm:grid-cols-3">
            {(Object.keys(fonts) as Array<keyof typeof fonts>).map((slot) => (
              <label key={slot} className="space-y-xs text-sm">
                <span className="block font-medium capitalize">{slot}</span>
                <Select
                  value={fonts[slot]}
                  onChange={(e) => setFonts((prev) => ({ ...prev, [slot]: e.target.value }))}
                  aria-label={`font ${slot}`}
                >
                  {initial.fontCatalog.map((f) => (
                    <option key={f.key} value={f.key}>
                      {f.label}
                    </option>
                  ))}
                </Select>
              </label>
            ))}
          </div>
        </section>

        <section className="space-y-sm">
          <h2 className="font-display text-lg font-semibold">{t('admin.appearance.sizes.title')}</h2>
          <div className="grid grid-cols-2 gap-sm sm:grid-cols-4">
            {(Object.keys(fontSizes) as Array<keyof typeof fontSizes>).map((key) => (
              <label key={key} className="space-y-xs text-sm">
                <span className="block font-mono text-xs text-muted">{key}</span>
                <Input
                  value={fontSizes[key]}
                  onChange={(e) => setFontSizes((prev) => ({ ...prev, [key]: e.target.value }))}
                  className="font-mono"
                  aria-label={`font-size ${key}`}
                />
              </label>
            ))}
          </div>
        </section>

        {error && <Alert>{error}</Alert>}
        {saved && (
          <div className="rounded-md bg-primary/10 p-md text-sm text-primary" role="status">
            {t('admin.appearance.saved')}
          </div>
        )}

        <div className="flex items-center gap-sm">
          <Button onClick={onSave} disabled={saving}>
            {saving ? t('admin.appearance.saving') : t('admin.appearance.save')}
          </Button>
        </div>
      </div>

      {/* Right: live preview */}
      <div className="lg:sticky lg:top-md lg:self-start">
        <AppearancePreview
          tokenKeys={initial.tokenKeys}
          fontCatalog={initial.fontCatalog}
          lightColors={lightColors}
          darkColors={darkColors}
          fonts={fonts}
          fontSizes={fontSizes}
        />
      </div>
    </div>
  );
}
