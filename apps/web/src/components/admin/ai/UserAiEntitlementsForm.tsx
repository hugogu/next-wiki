'use client';

import { useState } from 'react';
import type { AiEntitlementView } from '@next-wiki/shared';
import { Switch } from '@/components/ui/Switch';
import { Button } from '@/components/ui/Button';
import { useTranslation } from '@/i18n/client';

export function UserAiEntitlementsForm({ initial }: { initial: AiEntitlementView }) {
  const { t } = useTranslation();
  const [value, setValue] = useState(initial);
  const fields = [
    ['questionAnsweringEnabled', 'admin.ai.entitlement.question'],
    ['textOptimizationEnabled', 'admin.ai.entitlement.text'],
    ['imageGenerationEnabled', 'admin.ai.entitlement.image'],
  ] as const;
  return (
    <div className="space-y-md">
      {initial.reasons.length > 0 && <p className="text-sm text-muted">{initial.reasons.join(' · ')}</p>}
      <div className="space-y-sm rounded-lg border border-border bg-surface p-md">
        {fields.map(([field, key]) => (
          <div key={field} className="flex items-center justify-between">
            <label>{t(key)}</label>
            <Switch checked={value[field]} onClick={() => setValue((current) => ({ ...current, [field]: !current[field] }))} />
          </div>
        ))}
      </div>
      <Button onClick={async () => {
        const response = await fetch(`/api/ai/entitlements/${initial.userId}`, {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            questionAnsweringEnabled: value.questionAnsweringEnabled,
            textOptimizationEnabled: value.textOptimizationEnabled,
            imageGenerationEnabled: value.imageGenerationEnabled,
          }),
        });
        if (response.ok) window.location.reload();
      }}>{t('admin.ai.entitlement.save')}</Button>
    </div>
  );
}
