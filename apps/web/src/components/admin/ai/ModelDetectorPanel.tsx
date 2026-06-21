'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useTranslation } from '@/i18n/client';

export function ModelDetectorPanel({
  hasModelDetectorApiKey,
}: {
  hasModelDetectorApiKey: boolean;
}) {
  const { t } = useTranslation();
  const [detectorKey, setDetectorKey] = useState('');
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
        className="max-w-2xl space-y-md rounded-lg border border-border bg-surface p-md"
        onSubmit={async (event) => {
          event.preventDefault();
          setSaving(true);
          setMessage(null);
          const response = await fetch('/api/ai/settings', {
            method: 'PATCH',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ modelDetectorApiKey: detectorKey }),
          });
          if (response.ok) {
            setDetectorKey('');
            setMessage(t('admin.ai.modelDetector.saved'));
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
