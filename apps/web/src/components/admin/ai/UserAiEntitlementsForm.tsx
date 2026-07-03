'use client';

import { useState } from 'react';
import type { AiEntitlementUpdate, AiEntitlementView } from '@next-wiki/shared';
import { Switch } from '@/components/ui/Switch';
import { useApiMutation, type ApiError } from '@/lib/api/client';
import { useTranslation } from '@/i18n/client';

const FIELDS = [
  ['questionAnsweringEnabled', 'admin.ai.entitlement.question'],
  ['textOptimizationEnabled', 'admin.ai.entitlement.text'],
  ['imageGenerationEnabled', 'admin.ai.entitlement.image'],
] as const;

type FieldKey = (typeof FIELDS)[number][0];

export function UserAiEntitlementsForm({ initial }: { initial: AiEntitlementView }) {
  const { t } = useTranslation();
  const [value, setValue] = useState<AiEntitlementView>(initial);
  const [error, setError] = useState<string | null>(null);

  const save = useApiMutation<AiEntitlementUpdate, AiEntitlementView>(
    `/api/ai/entitlements/${encodeURIComponent(initial.userId)}`,
    {
      method: 'PUT',
      onSuccess: (data) => {
        setError(null);
        // Adopt the authoritative server view (keeps reasons/aiEnabled fresh).
        setValue(data);
      },
    },
  );

  const handleToggle = (field: FieldKey) => {
    if (save.isPending) return;
    const previous = value;
    const next = { ...value, [field]: !value[field] };
    setValue(next); // optimistic
    setError(null);
    const body: AiEntitlementUpdate = {
      questionAnsweringEnabled: next.questionAnsweringEnabled,
      textOptimizationEnabled: next.textOptimizationEnabled,
      imageGenerationEnabled: next.imageGenerationEnabled,
    };
    save.mutate(body, {
      onError: (err: ApiError) => {
        setValue(previous); // revert on failure
        setError(err.message);
      },
    });
  };

  return (
    <div className="space-y-md">
      {value.reasons.length > 0 && <p className="text-sm text-muted">{value.reasons.join(' · ')}</p>}
      <div className="space-y-sm rounded-lg border border-border bg-surface p-md">
        {FIELDS.map(([field, key]) => (
          <div key={field} className="flex items-center justify-between">
            <label>{t(key)}</label>
            <Switch
              checked={value[field]}
              onClick={() => handleToggle(field)}
              disabled={save.isPending}
              aria-label={t(key)}
            />
          </div>
        ))}
      </div>
      {save.isPending && <p className="text-sm text-muted">{t('admin.ai.entitlement.saving')}</p>}
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}
