'use client';

import { useState } from 'react';
import { Switch } from '@/components/ui/Switch';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useTranslation } from '@/i18n/client';

export function AiSettingsPanel({
  enabled,
  hasModelDetectorApiKey,
}: {
  enabled: boolean;
  hasModelDetectorApiKey: boolean;
}) {
  const { t } = useTranslation();
  const [value, setValue] = useState(enabled);
  const [detectorKey, setDetectorKey] = useState('');
  const [detectorSaving, setDetectorSaving] = useState(false);
  const [detectorMessage, setDetectorMessage] = useState<string | null>(null);
  return (
    <div className="space-y-md">
      <div className="flex items-center justify-between rounded-lg border border-border bg-surface p-md">
        <div>
          <h2 className="font-medium">{t('admin.ai.global.title')}</h2>
          <p className="text-sm text-muted">{t('admin.ai.global.description')}</p>
        </div>
        <Switch
          checked={value}
          aria-label={t('admin.ai.global.title')}
          onClick={async () => {
            const next = !value;
            const response = await fetch('/api/ai/settings', {
              method: 'PATCH',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ enabled: next }),
            });
            if (response.ok) setValue(next);
          }}
        />
      </div>
      <div className="rounded-lg border border-border bg-surface p-md">
        <h2 className="font-medium">{t('admin.ai.modelDetector.title')}</h2>
        <p className="text-sm text-muted">{t('admin.ai.modelDetector.description')}</p>
        {hasModelDetectorApiKey && (
          <p className="mt-xs text-xs text-success">{t('admin.ai.modelDetector.configured')}</p>
        )}
        <form
          className="mt-sm flex items-end gap-sm"
          onSubmit={async (event) => {
            event.preventDefault();
            setDetectorSaving(true);
            setDetectorMessage(null);
            const response = await fetch('/api/ai/settings', {
              method: 'PATCH',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ modelDetectorApiKey: detectorKey }),
            });
            if (response.ok) {
              setDetectorKey('');
              setDetectorMessage(t('admin.ai.modelDetector.saved'));
            } else {
              setDetectorMessage(t('admin.ai.error.generic'));
            }
            setDetectorSaving(false);
          }}
        >
          <label className="block flex-1 space-y-xs">
            <span className="text-sm font-medium">{t('admin.ai.modelDetector.apiKey')}</span>
            <Input
              type="password"
              value={detectorKey}
              onChange={(event) => setDetectorKey(event.target.value)}
              placeholder={hasModelDetectorApiKey ? t('admin.ai.modelDetector.replaceHint') : ''}
            />
          </label>
          <Button type="submit" disabled={detectorSaving || !detectorKey}>
            {detectorSaving ? t('admin.ai.saving') : t('admin.ai.modelDetector.save')}
          </Button>
        </form>
        {detectorMessage && <p className="mt-xs text-xs text-muted">{detectorMessage}</p>}
      </div>
    </div>
  );
}
