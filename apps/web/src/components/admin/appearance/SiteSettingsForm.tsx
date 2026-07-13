'use client';

import { useRef, useState } from 'react';
import type { SiteSettingsView } from '@next-wiki/shared';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Alert } from '@/components/ui/Alert';
import { useTranslation } from '@/i18n/client';

export function SiteSettingsForm({ initial }: { initial: SiteSettingsView }) {
  const { t } = useTranslation();
  const [siteName, setSiteName] = useState(initial.siteName);
  const [footerCopyright, setFooterCopyright] = useState(initial.footerCopyright ?? '');
  const [icpNumber, setIcpNumber] = useState(initial.icp.number ?? '');
  const [icpUrl, setIcpUrl] = useState(initial.icp.url ?? '');
  const [psNumber, setPsNumber] = useState(initial.publicSecurity.number ?? '');
  const [psUrl, setPsUrl] = useState(initial.publicSecurity.url ?? '');
  const [hasCustomIcon, setHasCustomIcon] = useState(initial.hasCustomIcon);
  const [iconVersion, setIconVersion] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function onSave() {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const response = await fetch('/api/settings/site', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          siteName,
          footerCopyright: footerCopyright || null,
          icpNumber: icpNumber || null,
          icpUrl: icpUrl || null,
          publicSecurityNumber: psNumber || null,
          publicSecurityUrl: psUrl || null,
        }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setError(body?.message ?? t('admin.site.error.generic'));
        return;
      }
      setSaved(true);
    } catch {
      setError(t('admin.site.error.generic'));
    } finally {
      setSaving(false);
    }
  }

  async function onUploadIcon(file: File) {
    setError(null);
    const form = new FormData();
    form.append('file', file);
    const response = await fetch('/api/settings/site/icon', { method: 'PUT', body: form });
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      setError(body?.message ?? t('admin.site.error.generic'));
      return;
    }
    setHasCustomIcon(true);
    setIconVersion((v) => v + 1);
  }

  async function onRemoveIcon() {
    setError(null);
    const response = await fetch('/api/settings/site/icon', { method: 'DELETE' });
    if (!response.ok) {
      setError(t('admin.site.error.generic'));
      return;
    }
    setHasCustomIcon(false);
    setIconVersion((v) => v + 1);
  }

  const field = (label: string, value: string, set: (v: string) => void, placeholder?: string) => (
    <label className="space-y-xs text-sm">
      <span className="block font-medium">{label}</span>
      <Input value={value} onChange={(e) => set(e.target.value)} placeholder={placeholder} />
    </label>
  );

  return (
    <div className="max-w-5xl space-y-lg">
      <div className="grid gap-xl lg:grid-cols-2">
        <div className="space-y-lg">
          <section className="space-y-sm">
            {field(t('admin.site.name.label'), siteName, setSiteName)}
          </section>

          <section className="space-y-sm">
            <span className="block text-sm font-medium">{t('admin.site.icon.label')}</span>
            <div className="flex items-center gap-md">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/api/settings/site/icon?v=${iconVersion}`}
                alt={t('admin.site.icon.label')}
                className="h-12 w-12 rounded-md border border-border bg-surface object-contain p-1"
              />
              <input
                ref={fileRef}
                type="file"
                accept="image/svg+xml,image/png,image/x-icon"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void onUploadIcon(file);
                  e.target.value = '';
                }}
              />
              <Button variant="secondary" onClick={() => fileRef.current?.click()}>
                {t('admin.site.icon.upload')}
              </Button>
              {hasCustomIcon && (
                <Button variant="ghost" onClick={onRemoveIcon}>
                  {t('admin.site.icon.remove')}
                </Button>
              )}
            </div>
            <p className="text-xs text-muted">{t('admin.site.icon.hint')}</p>
          </section>

          <section className="space-y-sm">
            {field(t('admin.site.footer.label'), footerCopyright, setFooterCopyright, '© 2026 Example Org')}
          </section>
        </div>

        <section className="space-y-sm">
          <h2 className="font-display text-lg font-semibold">{t('admin.site.filing.title')}</h2>
          <div className="grid gap-sm sm:grid-cols-2">
            {field(t('admin.site.icp.numberLabel'), icpNumber, setIcpNumber, '京ICP备12345678号')}
            {field(t('admin.site.icp.urlLabel'), icpUrl, setIcpUrl, 'https://beian.miit.gov.cn/')}
            {field(t('admin.site.ps.numberLabel'), psNumber, setPsNumber)}
            {field(t('admin.site.ps.urlLabel'), psUrl, setPsUrl, 'https://beian.mps.gov.cn/')}
          </div>
        </section>
      </div>

      {error && <Alert>{error}</Alert>}
      {saved && (
        <div className="rounded-md bg-primary/10 p-md text-sm text-primary" role="status">
          {t('admin.site.saved')}
        </div>
      )}

      <Button onClick={onSave} disabled={saving}>
        {saving ? t('admin.site.saving') : t('admin.site.save')}
      </Button>
    </div>
  );
}
