'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type {
  TranslationLanguageView,
  TranslationPromptTemplateView,
  TranslationRunAccepted,
  TranslationRunCreate,
  TranslationRunMode,
} from '@next-wiki/shared';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { useApiMutation } from '@/lib/api/client';
import { useTranslation } from '@/i18n/client';

type Model = { id: string; displayName: string };

export function TranslationRunCreateForm({
  languages,
  models,
  styles,
}: {
  languages: TranslationLanguageView[];
  models: Model[];
  styles: TranslationPromptTemplateView[];
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const enabled = languages.filter((l) => l.enabled && !l.retired);
  const [targetLocale, setTargetLocale] = useState(enabled[0]?.code ?? '');
  const [modelId, setModelId] = useState('');
  const [versionId, setVersionId] = useState('');
  const [mode, setMode] = useState<TranslationRunMode>('missing');

  const create = useApiMutation<TranslationRunCreate, TranslationRunAccepted>(
    '/api/translations/runs',
    {
      onSuccess: (accepted) => router.push(`/admin/translations/${accepted.id}`),
    },
  );

  if (enabled.length === 0) {
    return (
      <p className="rounded-lg border border-border p-md text-sm text-muted">
        {t('translation.language.empty')}
      </p>
    );
  }

  return (
    <form
      className="flex flex-wrap items-end gap-sm rounded-lg border border-border p-md"
      onSubmit={(e) => {
        e.preventDefault();
        create.mutate({
          targetLocale,
          modelId: modelId || undefined,
          promptVersionId: versionId || undefined,
          scope: { kind: 'all_published' },
          mode,
        });
      }}
    >
      <label className="flex flex-col gap-xs text-sm">
        <span className="text-muted">{t('translation.run.targetLocale')}</span>
        <Select value={targetLocale} onChange={(e) => setTargetLocale(e.target.value)} className="w-32">
          {enabled.map((l) => (
            <option key={l.code} value={l.code}>
              {l.code.toUpperCase()}
            </option>
          ))}
        </Select>
      </label>
      <label className="flex flex-col gap-xs text-sm">
        <span className="text-muted">{t('translation.run.model')}</span>
        <Select value={modelId} onChange={(e) => setModelId(e.target.value)} className="w-56">
          <option value="">{t('translation.run.modelDefault')}</option>
          {models.map((m) => (
            <option key={m.id} value={m.id}>
              {m.displayName}
            </option>
          ))}
        </Select>
      </label>
      <label className="flex flex-col gap-xs text-sm">
        <span className="text-muted">{t('translation.run.style')}</span>
        <Select value={versionId} onChange={(e) => setVersionId(e.target.value)} className="w-56">
          <option value="">{t('translation.language.none')}</option>
          {styles
            .filter((s) => s.currentVersion)
            .map((s) => (
              <option key={s.id} value={s.currentVersion!.id}>
                {s.name}
              </option>
            ))}
        </Select>
      </label>
      <label className="flex flex-col gap-xs text-sm">
        <span className="text-muted">{t('translation.run.mode')}</span>
        <Select value={mode} onChange={(e) => setMode(e.target.value as TranslationRunMode)} className="w-56">
          <option value="missing">{t('translation.run.mode.missing')}</option>
          <option value="all">{t('translation.run.mode.all')}</option>
        </Select>
      </label>
      <Button type="submit" disabled={create.isPending || !targetLocale}>
        {create.isPending ? t('common.status.saving') : t('translation.run.create')}
      </Button>
      {create.error && <span className="text-sm text-danger">{create.error.message}</span>}
    </form>
  );
}
