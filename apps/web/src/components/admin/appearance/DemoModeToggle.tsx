'use client';

import { useState } from 'react';
import { Switch } from '@/components/ui/Switch';
import { useTranslation } from '@/i18n/client';

export function DemoModeToggle({ enabled }: { enabled: boolean }) {
  const { t } = useTranslation();
  const [value, setValue] = useState(enabled);
  return (
    <div className="rounded-md border border-warning/40 bg-warning/10 p-md">
      <label className="flex items-center justify-between gap-md">
        <span>
          <span className="block text-sm font-medium">{t('admin.demoReadonly.toggle.label')}</span>
          <span className="mt-xs block text-xs text-muted">{t('admin.demoReadonly.toggle.description')}</span>
        </span>
        <Switch
          checked={value}
          aria-label={t('admin.demoReadonly.toggle.label')}
          onClick={async () => {
            const next = !value;
            const response = await fetch('/api/settings/demo-mode', {
              method: 'PATCH',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ enabled: next }),
            });
            if (response.ok) setValue(next);
          }}
        />
      </label>
    </div>
  );
}
