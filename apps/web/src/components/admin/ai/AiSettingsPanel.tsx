'use client';

import { useState } from 'react';
import { Switch } from '@/components/ui/Switch';
import { useTranslation } from '@/i18n/client';

export function AiSettingsPanel({ enabled }: { enabled: boolean }) {
  const { t } = useTranslation();
  const [value, setValue] = useState(enabled);
  return (
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
  );
}
