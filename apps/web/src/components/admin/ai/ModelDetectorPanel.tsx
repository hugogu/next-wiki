'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Switch } from '@/components/ui/Switch';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useTranslation } from '@/i18n/client';

export function ModelDetectorPanel({
  hasModelDetectorApiKey,
}: {
  hasModelDetectorApiKey: boolean;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const [detectorKey, setDetectorKey] = useState('');
  const [registerProviders, setRegisterProviders] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  return (
    <section className="space-y-md">
      <div>
        <div className="flex items-center gap-sm">
          <h2 className="font-display text-lg font-semibold">{t('admin.ai.modelDetector.title')}</h2>
          <StatusBadge tone={hasModelDetectorApiKey ? 'success' : 'neutral'}>
            {hasModelDetectorApiKey
              ? t('admin.ai.modelDetector.configured')
              : t('admin.ai.modelDetector.unconfigured')}
          </StatusBadge>
        </div>
        <p className="mt-xs text-sm text-muted">{t('admin.ai.modelDetector.description')}</p>
      </div>
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
            if (registerProviders) router.refresh();
          } else {
            setMessage(t('admin.ai.error.generic'));
          }
          setSaving(false);
        }}
      >
        <label className="block space-y-xs">
          <span className="text-sm font-medium">{t('admin.ai.modelDetector.apiKey')}</span>
          <Input
            type="password"
            value={detectorKey}
            onChange={(event) => setDetectorKey(event.target.value)}
            placeholder={hasModelDetectorApiKey ? t('admin.ai.modelDetector.replaceHint') : ''}
          />
        </label>
        <label className="flex items-start gap-sm">
          <Switch
            checked={registerProviders}
            onClick={() => setRegisterProviders((prev) => !prev)}
          />
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
    </section>
  );
}
