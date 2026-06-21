'use client';

import { useState } from 'react';
import type { AiModelView, AiPurpose } from '@next-wiki/shared';
import { apiPut, type ApiError } from '@/lib/api/client';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useTranslation } from '@/i18n/client';
import type { TranslationKey } from '@/i18n/types';

const purposes: AiPurpose[] = ['wiki_text', 'wiki_embedding', 'wiki_image'];
const purposeLabels: Record<AiPurpose, TranslationKey> = {
  wiki_text: 'admin.ai.function.text',
  wiki_embedding: 'admin.ai.function.embedding',
  wiki_image: 'admin.ai.function.image',
};
const purposeDescriptions: Record<AiPurpose, TranslationKey> = {
  wiki_text: 'admin.ai.function.textDescription',
  wiki_embedding: 'admin.ai.function.embeddingDescription',
  wiki_image: 'admin.ai.function.imageDescription',
};
const requiredCapability = {
  wiki_text: 'text_generation',
  wiki_embedding: 'embedding',
  wiki_image: 'image_generation',
} as const;

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
  const selectedEmbedding = models.find((model) => model.id === values.wiki_embedding);
  const [embeddingDimensions, setEmbeddingDimensions] = useState(
    selectedEmbedding?.embeddingDimensions?.toString() ?? '',
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<AiPurpose | null>(null);

  return (
    <section className="space-y-md">
      <div>
        <h2 className="font-display text-lg font-semibold">{t('admin.ai.assignments.title')}</h2>
        <p className="mt-xs text-sm text-muted">{t('admin.ai.assignments.description')}</p>
      </div>
      {error && <Alert>{error}</Alert>}
      <div className="overflow-hidden rounded-lg border border-border bg-surface">
        {purposes.map((purpose) => {
          const assigned = assignments.find((item) => item.purpose === purpose);
          const selected = models.find((model) => model.id === values[purpose]);
          const detected = selected?.capabilities.some(
            (item) => item.capability === requiredCapability[purpose] && item.supported,
          );
          return (
            <div
              key={purpose}
              className="grid gap-md border-t border-border p-md first:border-t-0 lg:grid-cols-[minmax(12rem,0.8fr)_minmax(16rem,1.3fr)_auto] lg:items-center"
            >
              <div>
                <div className="flex items-center gap-sm">
                  <p className="font-medium">{t(purposeLabels[purpose])}</p>
                  <StatusBadge tone={assigned ? 'success' : 'neutral'}>
                    {assigned ? t('admin.ai.function.configured') : t('admin.ai.function.unconfigured')}
                  </StatusBadge>
                </div>
                <p className="mt-xs text-xs text-muted">{t(purposeDescriptions[purpose])}</p>
              </div>
              <div className="space-y-sm">
                <Select
                  value={values[purpose]}
                  onChange={(event) => {
                    const modelId = event.target.value;
                    setValues((current) => ({ ...current, [purpose]: modelId }));
                    if (purpose === 'wiki_embedding') {
                      setEmbeddingDimensions(
                        models.find((model) => model.id === modelId)?.embeddingDimensions?.toString() ?? '',
                      );
                    }
                  }}
                >
                  <option value="">{t('admin.ai.assignments.none')}</option>
                  {models
                    .filter((model) => {
                      const expectedType = {
                        wiki_text: 'chat',
                        wiki_embedding: 'embedding',
                        wiki_image: 'image',
                      } as const;
                      return model.availability !== 'unavailable'
                        && model.providerType === expectedType[purpose];
                    })
                    .map((model) => (
                      <option key={model.id} value={model.id}>
                        {model.providerName} / {model.displayName}
                      </option>
                    ))}
                </Select>
                {purpose === 'wiki_embedding' && values[purpose] && (
                  <Input
                    type="number"
                    min={1}
                    value={embeddingDimensions}
                    onChange={(event) => setEmbeddingDimensions(event.target.value)}
                    placeholder={t('admin.ai.function.embeddingDimensions')}
                  />
                )}
                {selected && !detected && (
                  <p className="text-xs text-warning">
                    {t('admin.ai.function.confirmCapability', { model: selected.displayName })}
                  </p>
                )}
              </div>
              <Button
                disabled={
                  !values[purpose] ||
                  saving === purpose ||
                  (purpose === 'wiki_embedding' && !Number(embeddingDimensions))
                }
                onClick={async () => {
                  setSaving(purpose);
                  setError(null);
                  try {
                    await apiPut(`/api/ai/assignments/${purpose}`, {
                      modelId: values[purpose],
                      confirmCapability: true,
                      ...(purpose === 'wiki_embedding'
                        ? { embeddingDimensions: Number(embeddingDimensions) }
                        : {}),
                    });
                    window.location.reload();
                  } catch (value) {
                    setError((value as ApiError).message ?? t('admin.ai.error.generic'));
                    setSaving(null);
                  }
                }}
              >
                {saving === purpose ? t('admin.ai.saving') : t('admin.ai.function.save')}
              </Button>
            </div>
          );
        })}
      </div>
    </section>
  );
}
