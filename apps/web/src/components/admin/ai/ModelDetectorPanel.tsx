'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Switch } from '@/components/ui/Switch';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useTranslation } from '@/i18n/client';

/**
 * Model Capability Detector configuration. Each detector is configured
 * independently — its credentials are stored separately and persist when other
 * detectors change — so administrators can keep several keys on hand and, in
 * future, cross-validate capability evidence across detectors.
 */
export function ModelDetectorPanel({
  hasModelDetectorApiKey,
  cloudflareDetectorEnabled,
  cloudflareAccountId,
  hasCloudflareToken,
}: {
  hasModelDetectorApiKey: boolean;
  cloudflareDetectorEnabled: boolean;
  cloudflareAccountId: string | null;
  hasCloudflareToken: boolean;
}) {
  const { t } = useTranslation();

  return (
    <section className="space-y-md">
      <div>
        <h2 className="font-display text-lg font-semibold">{t('admin.ai.modelDetector.title')}</h2>
        <p className="mt-xs text-sm text-muted">{t('admin.ai.modelDetector.description')}</p>
      </div>
      <OpenRouterCard hasKey={hasModelDetectorApiKey} />
      <CloudflareCard
        enabled={cloudflareDetectorEnabled}
        accountId={cloudflareAccountId}
        hasToken={hasCloudflareToken}
      />
    </section>
  );
}

function DetectorHeader({ title, configured }: { title: string; configured: boolean }) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-sm">
      <h3 className="font-display text-base font-semibold">{title}</h3>
      <StatusBadge tone={configured ? 'success' : 'neutral'}>
        {configured ? t('admin.ai.modelDetector.configured') : t('admin.ai.modelDetector.unconfigured')}
      </StatusBadge>
    </div>
  );
}

function OpenRouterCard({ hasKey }: { hasKey: boolean }) {
  const { t } = useTranslation();
  const router = useRouter();
  const [detectorKey, setDetectorKey] = useState('');
  const [registerProviders, setRegisterProviders] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  return (
    <form
      className="space-y-md rounded-lg border border-border bg-surface p-md"
      onSubmit={async (event) => {
        event.preventDefault();
        setSaving(true);
        setMessage(null);
        const response = await fetch('/api/ai/settings', {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            modelDetectorApiKey: detectorKey,
            registerOpenRouterProviders: registerProviders,
          }),
        });
        if (response.ok) {
          setDetectorKey('');
          setMessage(t('admin.ai.modelDetector.saved'));
          router.refresh();
        } else {
          setMessage(t('admin.ai.error.generic'));
        }
        setSaving(false);
      }}
    >
      <DetectorHeader title={t('admin.ai.modelDetector.source.openrouter')} configured={hasKey} />
      <p className="text-sm text-muted">{t('admin.ai.modelDetector.openrouterHint')}</p>
      <label className="block space-y-xs">
        <span className="text-sm font-medium">{t('admin.ai.modelDetector.apiKey')}</span>
        <Input
          type="password"
          value={detectorKey}
          onChange={(event) => setDetectorKey(event.target.value)}
          placeholder={hasKey ? t('admin.ai.modelDetector.replaceHint') : ''}
        />
      </label>
      <label className="flex items-start gap-sm">
        <Switch checked={registerProviders} onClick={() => setRegisterProviders((prev) => !prev)} />
        <span className="space-y-xs">
          <span className="block text-sm font-medium">{t('admin.ai.modelDetector.registerProviders')}</span>
          <span className="block text-sm text-muted">{t('admin.ai.modelDetector.registerProvidersHint')}</span>
        </span>
      </label>
      <div className="flex items-center justify-between gap-sm">
        {message ? <p className="text-sm text-muted">{message}</p> : <span />}
        <Button type="submit" disabled={saving || !detectorKey}>
          {saving ? t('admin.ai.saving') : t('admin.ai.modelDetector.save')}
        </Button>
      </div>
    </form>
  );
}

function CloudflareCard({
  enabled,
  accountId,
  hasToken,
}: {
  enabled: boolean;
  accountId: string | null;
  hasToken: boolean;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const [enabledState, setEnabledState] = useState(enabled);
  const [account, setAccount] = useState(accountId ?? '');
  const [token, setToken] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const configured = Boolean(accountId) && hasToken;

  return (
    <form
      className="space-y-md rounded-lg border border-border bg-surface p-md"
      onSubmit={async (event) => {
        event.preventDefault();
        setSaving(true);
        setMessage(null);
        const body: Record<string, unknown> = { cloudflareDetectorEnabled: enabledState };
        if (account.trim()) body.cloudflareAccountId = account.trim();
        if (token) body.cloudflareApiToken = token;
        const response = await fetch('/api/ai/settings', {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (response.ok) {
          setToken('');
          setMessage(t('admin.ai.modelDetector.saved'));
          router.refresh();
        } else {
          setMessage(t('admin.ai.error.generic'));
        }
        setSaving(false);
      }}
    >
      <DetectorHeader title={t('admin.ai.modelDetector.source.cloudflare')} configured={configured} />
      <p className="text-sm text-muted">{t('admin.ai.modelDetector.cloudflareHint')}</p>
      <label className="flex items-start gap-sm">
        <Switch checked={enabledState} onClick={() => setEnabledState((prev) => !prev)} />
        <span className="space-y-xs">
          <span className="block text-sm font-medium">{t('admin.ai.modelDetector.cloudflareEnabled')}</span>
          <span className="block text-sm text-muted">{t('admin.ai.modelDetector.cloudflareEnabledHint')}</span>
        </span>
      </label>
      <label className="block space-y-xs">
        <span className="text-sm font-medium">{t('admin.ai.modelDetector.cloudflareAccountId')}</span>
        <Input value={account} onChange={(event) => setAccount(event.target.value)} />
        <span className="block text-xs text-muted">{t('admin.ai.modelDetector.cloudflareAccountIdHint')}</span>
      </label>
      <label className="block space-y-xs">
        <span className="text-sm font-medium">{t('admin.ai.modelDetector.cloudflareToken')}</span>
        <Input
          type="password"
          value={token}
          onChange={(event) => setToken(event.target.value)}
          placeholder={hasToken ? t('admin.ai.modelDetector.replaceHint') : ''}
        />
        <span className="block text-xs text-muted">{t('admin.ai.modelDetector.cloudflareTokenHint')}</span>
      </label>
      <div className="flex items-center justify-between gap-sm">
        {message ? <p className="text-sm text-muted">{message}</p> : <span />}
        <Button
          type="submit"
          disabled={saving || ((!account.trim() && !accountId) || (!token && !hasToken))}
        >
          {saving ? t('admin.ai.saving') : t('admin.ai.modelDetector.save')}
        </Button>
      </div>
    </form>
  );
}
