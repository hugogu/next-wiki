'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { AnalyticsProviderItem, AnalyticsSettingsView } from '@next-wiki/shared';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { SettingsTabs } from '@/components/ui/SettingsTabs';
import { Switch } from '@/components/ui/Switch';
import { useTranslation } from '@/i18n/client';
import type { TranslationKey } from '@/i18n/types';

type ProviderCopy = {
  labelKey: TranslationKey;
  descriptionKey: TranslationKey;
  trackingIdLabelKey: TranslationKey;
  trackingIdFormatKey: TranslationKey;
};

/** UI copy for each registered provider is localized client-side (like
 * `ContentDataSourcesPanel`) rather than trusting the server's English
 * label/description, which exist mainly for API/MCP consumers. A future
 * provider not yet added here falls back to the server-provided strings so
 * the form never renders blank (see US4 - pluggability). */
const PROVIDER_COPY: Record<string, ProviderCopy> = {
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

function fieldFor(item: AnalyticsProviderItem): FieldState {
  return { enabled: item.enabled, trackingId: item.trackingId ?? '', error: null };
}

function parseTab(value: string | null, providers: AnalyticsProviderItem[]): string {
  if (!value) return providers[0]?.provider ?? '';
  return providers.some((item) => item.provider === value) ? value : (providers[0]?.provider ?? '');
}

function useProviderCopy(provider: AnalyticsProviderItem, copy: ProviderCopy | undefined) {
  const { t } = useTranslation();
  return {
    label: copy ? t(copy.labelKey) : provider.label,
    description: copy ? t(copy.descriptionKey) : provider.description,
    trackingIdLabel: copy ? t(copy.trackingIdLabelKey) : FALLBACK_TRACKING_ID_LABEL,
    trackingIdFormat: copy ? t(copy.trackingIdFormatKey) : provider.trackingIdFormat,
  };
}

type Status = 'idle' | 'applied' | 'error';

function ProviderPanel({
  item,
  field,
  status,
  errorMessage,
  applying,
  onToggle,
  onTrackingIdChange,
  onApply,
}: {
  item: AnalyticsProviderItem;
  field: FieldState;
  status: Status;
  errorMessage: string | null;
  applying: boolean;
  onToggle: () => void;
  onTrackingIdChange: (value: string) => void;
  onApply: () => void;
}) {
  const { t } = useTranslation();
  const copy = PROVIDER_COPY[item.provider];
  const localized = useProviderCopy(item, copy);

  return (
    <section className="rounded-lg border border-border bg-surface p-lg space-y-md">
      <div className="flex flex-wrap items-start justify-between gap-md">
        <div className="min-w-0 space-y-xs">
          <h2 className="font-display text-lg font-semibold">{localized.label}</h2>
          <p className="text-sm text-muted">{localized.description}</p>
        </div>
        <Button onClick={onApply} disabled={applying}>
          {t('admin.analytics.save')}
        </Button>
      </div>

      <div className="flex items-start justify-between gap-md border-t border-border pt-md">
        <div className="space-y-xs">
          <span className="block text-sm font-medium">
            {t(
              field.enabled ? 'admin.analytics.status.enabled' : 'admin.analytics.status.disabled',
            )}
          </span>
        </div>
        <Switch
          checked={field.enabled}
          aria-label={localized.label}
          onClick={onToggle}
        />
      </div>

      <label className="block space-y-xs text-sm">
        <span className="block font-medium">{localized.trackingIdLabel}</span>
        <Input
          value={field.trackingId}
          onChange={(event) => onTrackingIdChange(event.target.value)}
          placeholder={localized.trackingIdFormat}
        />
        <span className="block text-xs text-muted">{localized.trackingIdFormat}</span>
      </label>

      {status === 'error' && errorMessage && <Alert>{errorMessage}</Alert>}
      {status === 'applied' && (
        <div className="rounded-md bg-primary/10 p-md text-sm text-primary" role="status">
          {t('admin.analytics.saved')}
        </div>
      )}
      {status === 'error' && field.error && (
        <p className="text-xs text-danger" aria-live="polite">
          {field.error}
        </p>
      )}
    </section>
  );
}

export function AnalyticsProvidersForm({ initial }: { initial: AnalyticsSettingsView }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { t } = useTranslation();

  const [fields, setFields] = useState<Record<string, FieldState>>(() =>
    Object.fromEntries(initial.providers.map((item) => [item.provider, fieldFor(item)])),
  );
  const [statuses, setStatuses] = useState<Record<string, Status>>(() =>
    Object.fromEntries(initial.providers.map((item) => [item.provider, 'idle' as Status])),
  );
  const [errorMessages, setErrorMessages] = useState<Record<string, string | null>>(() =>
    Object.fromEntries(initial.providers.map((item) => [item.provider, null])),
  );
  const [applying, setApplying] = useState<string | null>(null);

  const selected = parseTab(searchParams.get('tab'), initial.providers);

  const selectTab = (provider: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', provider);
    router.push(`${pathname}?${params.toString()}`);
  };

  function setField(provider: string, patch: Partial<FieldState>) {
    setFields((prev) => ({ ...prev, [provider]: { ...prev[provider]!, ...patch } }));
    setStatuses((prev) => ({ ...prev, [provider]: 'idle' }));
  }

  async function apply(provider: string) {
    const field = fields[provider];
    if (!field) return;

    setApplying(provider);
    setStatuses((prev) => ({ ...prev, [provider]: 'idle' }));
    setErrorMessages((prev) => ({ ...prev, [provider]: null }));

    if (field.enabled && !field.trackingId.trim()) {
      const message = t('admin.analytics.enabledRequiresTrackingId');
      setFields((prev) => ({ ...prev, [provider]: { ...field, error: message } }));
      setStatuses((prev) => ({ ...prev, [provider]: 'error' }));
      setErrorMessages((prev) => ({ ...prev, [provider]: message }));
      setApplying(null);
      return;
    }

    try {
      const response = await fetch('/api/settings/analytics', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          providers: [
            {
              provider,
              enabled: field.enabled,
              trackingId: field.trackingId.trim() || null,
            },
          ],
        }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setStatuses((prev) => ({ ...prev, [provider]: 'error' }));
        setErrorMessages((prev) => ({
          ...prev,
          [provider]: body?.message ?? t('admin.analytics.saveFailed'),
        }));
        return;
      }
      const updated = (await response.json()) as AnalyticsSettingsView;
      const updatedItem = updated.providers.find((candidate) => candidate.provider === provider);
      if (updatedItem) {
        setFields((prev) => ({ ...prev, [provider]: fieldFor(updatedItem) }));
      }
      setStatuses((prev) => ({ ...prev, [provider]: 'applied' }));
    } catch {
      setStatuses((prev) => ({ ...prev, [provider]: 'error' }));
      setErrorMessages((prev) => ({ ...prev, [provider]: t('admin.analytics.saveFailed') }));
    } finally {
      setApplying(null);
    }
  }

  // Reset the per-provider "applied" badge after a short delay so the user
  // sees confirmation but the UI doesn't keep a stale success indicator.
  useEffect(() => {
    const appliedProviders = Object.entries(statuses)
      .filter(([, status]) => status === 'applied')
      .map(([provider]) => provider);
    if (appliedProviders.length === 0) return;
    const timer = window.setTimeout(() => {
      setStatuses((prev) => {
        const next = { ...prev };
        for (const provider of appliedProviders) next[provider] = 'idle';
        return next;
      });
    }, 2_000);
    return () => window.clearTimeout(timer);
  }, [statuses]);

  const tabs = initial.providers.map((item) => ({
    id: item.provider,
    label: PROVIDER_COPY[item.provider] ? t(PROVIDER_COPY[item.provider]!.labelKey) : item.label,
    status: t(
      item.enabled ? 'admin.analytics.status.enabled' : 'admin.analytics.status.disabled',
    ),
  }));

  const currentItem = initial.providers.find((item) => item.provider === selected);

  return (
    <SettingsTabs<string> tabs={tabs} selected={selected} onSelect={selectTab}>
      {currentItem ? (
        <ProviderPanel
          item={currentItem}
          field={fields[currentItem.provider] ?? fieldFor(currentItem)}
          status={statuses[currentItem.provider] ?? 'idle'}
          errorMessage={errorMessages[currentItem.provider] ?? null}
          applying={applying === currentItem.provider}
          onToggle={() => setField(currentItem.provider, { enabled: !(fields[currentItem.provider]?.enabled ?? currentItem.enabled) })}
          onTrackingIdChange={(value) => setField(currentItem.provider, { trackingId: value })}
          onApply={() => apply(currentItem.provider)}
        />
      ) : null}
    </SettingsTabs>
  );
}