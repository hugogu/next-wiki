'use client';

import { useState } from 'react';
import type { AnalyticsSettingsView } from '@next-wiki/shared';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Switch } from '@/components/ui/Switch';
import { Alert } from '@/components/ui/Alert';
import { useTranslation } from '@/i18n/client';
import type { TranslationKey } from '@/i18n/types';

/** UI copy for each registered provider is localized client-side (like
 * `ContentDataSourcesPanel`) rather than trusting the server's English
 * label/description, which exist mainly for API/MCP consumers. A future
 * provider not yet added here falls back to the server-provided strings so
 * the form never renders blank (see US4 - pluggability). */
const PROVIDER_COPY: Record<
  string,
  { labelKey: TranslationKey; descriptionKey: TranslationKey; trackingIdLabelKey: TranslationKey; trackingIdFormatKey: TranslationKey }
> = {
  baidu_tongji: {
    labelKey: 'admin.analytics.providers.baidu_tongji.label',
    descriptionKey: 'admin.analytics.providers.baidu_tongji.description',
    trackingIdLabelKey: 'admin.analytics.providers.baidu_tongji.trackingId.label',
    trackingIdFormatKey: 'admin.analytics.providers.baidu_tongji.trackingId.format',
  },
  google_analytics: {
    labelKey: 'admin.analytics.providers.google_analytics.label',
    descriptionKey: 'admin.analytics.providers.google_analytics.description',
    trackingIdLabelKey: 'admin.analytics.providers.google_analytics.trackingId.label',
    trackingIdFormatKey: 'admin.analytics.providers.google_analytics.trackingId.format',
  },
};

const FALLBACK_TRACKING_ID_LABEL = 'Tracking ID';

type FieldState = { enabled: boolean; trackingId: string; error: string | null };

function initialFields(view: AnalyticsSettingsView): Record<string, FieldState> {
  return Object.fromEntries(
    view.providers.map((item) => [item.provider, { enabled: item.enabled, trackingId: item.trackingId ?? '', error: null }]),
  );
}

export function AnalyticsProvidersForm({ initial }: { initial: AnalyticsSettingsView }) {
  const { t } = useTranslation();
  const [fields, setFields] = useState<Record<string, FieldState>>(() => initialFields(initial));
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  function setField(provider: string, patch: Partial<FieldState>) {
    setFields((prev) => ({ ...prev, [provider]: { ...prev[provider]!, ...patch } }));
  }

  async function handleSave() {
    setSaving(true);
    setStatus('idle');
    setErrorMessage(null);

    // Client-side validation mirrors the service's "enabled requires a
    // Tracking ID" rule so obviously invalid input never round-trips.
    let hasError = false;
    const validated: Record<string, FieldState> = {};
    for (const [provider, field] of Object.entries(fields)) {
      const error = field.enabled && !field.trackingId.trim() ? t('admin.analytics.enabledRequiresTrackingId') : null;
      if (error) hasError = true;
      validated[provider] = { ...field, error };
    }
    setFields(validated);
    if (hasError) {
      setSaving(false);
      return;
    }

    try {
      const response = await fetch('/api/settings/analytics', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          providers: Object.entries(fields).map(([provider, field]) => ({
            provider,
            enabled: field.enabled,
            trackingId: field.trackingId.trim() || null,
          })),
        }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setStatus('error');
        setErrorMessage(body?.message ?? t('admin.analytics.saveFailed'));
        return;
      }
      const updated = (await response.json()) as AnalyticsSettingsView;
      setFields(initialFields(updated));
      setStatus('success');
    } catch {
      setStatus('error');
      setErrorMessage(t('admin.analytics.saveFailed'));
    } finally {
      setSaving(false);
    }
  }

  const allDisabled = Object.values(fields).every((field) => !field.enabled);

  return (
    <div className="max-w-3xl space-y-lg">
      {allDisabled && <p className="text-sm text-muted">{t('admin.analytics.allDisabled')}</p>}

      <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
        {initial.providers.map((item) => {
          const copy = PROVIDER_COPY[item.provider];
          const label = copy ? t(copy.labelKey) : item.label;
          const description = copy ? t(copy.descriptionKey) : item.description;
          const trackingIdLabel = copy ? t(copy.trackingIdLabelKey) : FALLBACK_TRACKING_ID_LABEL;
          const trackingIdFormat = copy ? t(copy.trackingIdFormatKey) : item.trackingIdFormat;
          const field = fields[item.provider] ?? { enabled: item.enabled, trackingId: item.trackingId ?? '', error: null };

          return (
            <li key={item.provider} className="space-y-sm p-md">
              <div className="flex items-start justify-between gap-md">
                <div>
                  <span className="font-medium">{label}</span>
                  <p className="mt-xs text-sm text-muted">{description}</p>
                </div>
                <Switch checked={field.enabled} aria-label={label} onClick={() => setField(item.provider, { enabled: !field.enabled })} />
              </div>
              <label className="block space-y-xs text-sm">
                <span className="block font-medium">{trackingIdLabel}</span>
                <Input
                  value={field.trackingId}
                  onChange={(e) => setField(item.provider, { trackingId: e.target.value })}
                  placeholder={trackingIdFormat}
                />
              </label>
              <p className="text-xs text-muted">{trackingIdFormat}</p>
              {field.error && (
                <p className="text-xs text-danger" aria-live="polite">
                  {field.error}
                </p>
              )}
            </li>
          );
        })}
      </ul>

      {status === 'error' && <Alert>{errorMessage}</Alert>}
      {status === 'success' && (
        <div className="rounded-md bg-primary/10 p-md text-sm text-primary" role="status">
          {t('admin.analytics.saved')}
        </div>
      )}

      <Button onClick={handleSave} disabled={saving}>
        {t('admin.analytics.save')}
      </Button>
    </div>
  );
}
