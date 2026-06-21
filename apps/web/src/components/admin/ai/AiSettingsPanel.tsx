'use client';

import { useState } from 'react';
import { Switch } from '@/components/ui/Switch';
import { useTranslation } from '@/i18n/client';

export function AiSettingsPanel({
  enabled,
}: {
  enabled: boolean;
}) {
  const { t } = useTranslation();
  const [value, setValue] = useState(enabled);
  return (
    <label className="flex shrink-0 items-center gap-sm text-sm font-medium">
      <span>{t('admin.ai.global.title')}</span>
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
    </label>
  );
}
