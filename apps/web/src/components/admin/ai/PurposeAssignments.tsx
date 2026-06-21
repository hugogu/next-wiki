'use client';

import { useState } from 'react';
import type { AiModelView, AiPurpose } from '@next-wiki/shared';
import { apiPut, type ApiError } from '@/lib/api/client';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { useTranslation } from '@/i18n/client';
import type { TranslationKey } from '@/i18n/types';

const purposes: AiPurpose[] = ['wiki_text', 'wiki_embedding', 'wiki_image'];
const purposeLabels: Record<AiPurpose, TranslationKey> = {
  wiki_text: 'admin.ai.purpose.wiki_text',
  wiki_embedding: 'admin.ai.purpose.wiki_embedding',
  wiki_image: 'admin.ai.purpose.wiki_image',
};

export function PurposeAssignments({
  models,
  assignments,
}: {
  models: AiModelView[];
  assignments: Array<{ purpose: AiPurpose; modelId: string }>;
}) {
  const { t } = useTranslation();
  const [values, setValues] = useState<Record<AiPurpose, string>>(() => ({
    wiki_text: assignments.find((item) => item.purpose === 'wiki_text')?.modelId ?? '',
    wiki_embedding: assignments.find((item) => item.purpose === 'wiki_embedding')?.modelId ?? '',
    wiki_image: assignments.find((item) => item.purpose === 'wiki_image')?.modelId ?? '',
  }));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<AiPurpose | null>(null);
  return (
    <div className="space-y-sm rounded-lg border border-border bg-surface p-md">
      <h2 className="font-display text-lg font-semibold">{t('admin.ai.assignments.title')}</h2>
      {error && <Alert>{error}</Alert>}
      {purposes.map((purpose) => (
        <div key={purpose} className="grid gap-xs sm:grid-cols-[12rem_1fr_auto] sm:items-center">
          <label>{t(purposeLabels[purpose])}</label>
          <select className="rounded-md border border-border bg-background px-md py-sm" value={values[purpose]} onChange={(event) => setValues((current) => ({ ...current, [purpose]: event.target.value }))}>
            <option value="">{t('admin.ai.assignments.none')}</option>
            {models.map((model) => <option key={model.id} value={model.id}>{model.providerName} / {model.displayName}</option>)}
          </select>
          <Button
            disabled={!values[purpose] || saving === purpose}
            onClick={async () => {
              setSaving(purpose);
              setError(null);
              try {
                await apiPut(`/api/ai/assignments/${purpose}`, { modelId: values[purpose] });
                window.location.reload();
              } catch (value) {
                setError((value as ApiError).message ?? t('admin.ai.error.generic'));
                setSaving(null);
              }
            }}
          >
            {saving === purpose ? t('admin.ai.saving') : t('common.actions.confirm')}
          </Button>
        </div>
      ))}
    </div>
  );
}
