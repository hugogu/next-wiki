'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  SUPPORTED_TRANSLATION_LANGUAGES,
  type TranslationLanguageCreate,
  type TranslationLanguageView,
  type TranslationPromptTemplateView,
} from '@next-wiki/shared';
import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableHeader,
  DataTableRow,
} from '@/components/ui/DataTable';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Tooltip } from '@/components/ui/Tooltip';
import { PauseIcon, PlayIcon, TrashIcon } from '@/components/icons';
import { useApiMutation } from '@/lib/api/client';
import { useTranslation } from '@/i18n/client';

type Model = { id: string; displayName: string };

export function TranslationLanguageManager({
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
  // Only offer languages that are not already configured.
  const configured = new Set(languages.map((l) => l.code));
  const available = SUPPORTED_TRANSLATION_LANGUAGES.filter((l) => !configured.has(l.code));
  const [code, setCode] = useState(available[0]?.code ?? '');
  const [modelId, setModelId] = useState('');
  const [versionId, setVersionId] = useState('');

  const create = useApiMutation<TranslationLanguageCreate>('/api/translations/languages', {
    onSuccess: () => {
      setCode('');
      setModelId('');
      setVersionId('');
      router.refresh();
    },
  });
  const update = useApiMutation<{ code: string; enabled: boolean }>(
    (input) => `/api/translations/languages/${input.code}`,
    { method: 'PATCH' },
  );
  const retire = useApiMutation<{ code: string }>(
    (input) => `/api/translations/languages/${input.code}`,
    { method: 'DELETE' },
  );

  return (
    <div className="space-y-md">
      <form
        className="flex flex-wrap items-end gap-sm rounded-lg border border-border p-md"
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate({
            code: code.trim().toLowerCase(),
            enabled: true,
            defaultModelId: modelId || undefined,
            defaultPromptVersionId: versionId || undefined,
          });
        }}
      >
        <label className="flex flex-col gap-xs text-sm">
          <span className="text-muted">{t('translation.language.code')}</span>
          <Select
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="w-56"
            disabled={available.length === 0}
          >
            {available.map((l) => (
              <option key={l.code} value={l.code}>
                {l.name} ({l.code.toUpperCase()})
              </option>
            ))}
          </Select>
        </label>
        <label className="flex flex-col gap-xs text-sm">
          <span className="text-muted">{t('translation.language.defaultModel')}</span>
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
          <span className="text-muted">{t('translation.language.defaultStyle')}</span>
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
        <Button type="submit" disabled={create.isPending || code.trim().length !== 2}>
          {create.isPending ? t('common.status.saving') : t('translation.language.add')}
        </Button>
        {create.error && <span className="text-sm text-danger">{create.error.message}</span>}
      </form>

      {languages.length === 0 ? (
        <p className="rounded-lg border border-border p-md text-sm text-muted">
          {t('translation.language.empty')}
        </p>
      ) : (
        <DataTable>
          <DataTableHead>
            <DataTableRow>
              <DataTableHeader>{t('translation.language.code')}</DataTableHeader>
              <DataTableHeader>{t('translation.language.enabled')}</DataTableHeader>
              <DataTableHeader>{t('translation.language.defaultModel')}</DataTableHeader>
              <DataTableHeader>{t('admin.transfers.table.actions')}</DataTableHeader>
            </DataTableRow>
          </DataTableHead>
          <DataTableBody>
            {languages.map((lang) => (
              <DataTableRow key={lang.code}>
                <DataTableCell className="font-mono uppercase">{lang.code}</DataTableCell>
                <DataTableCell>
                  {lang.retired ? (
                    <StatusBadge tone="neutral">{t('translation.language.retired')}</StatusBadge>
                  ) : (
                    <StatusBadge tone={lang.enabled ? 'success' : 'neutral'}>
                      {t(lang.enabled ? 'translation.language.enabled' : 'translation.status.paused')}
                    </StatusBadge>
                  )}
                </DataTableCell>
                <DataTableCell className="text-muted">
                  {lang.defaultModelName ?? t('translation.run.modelDefault')}
                </DataTableCell>
                <DataTableCell>
                  {!lang.retired && (
                    <div className="flex items-center gap-xs">
                      <Tooltip
                        label={t(lang.enabled ? 'translation.language.disable' : 'translation.language.enable')}
                      >
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label={t(lang.enabled ? 'translation.language.disable' : 'translation.language.enable')}
                          disabled={update.isPending}
                          onClick={() =>
                            update.mutate(
                              { code: lang.code, enabled: !lang.enabled },
                              { onSuccess: () => router.refresh() },
                            )
                          }
                        >
                          {lang.enabled ? (
                            <PauseIcon className="h-4 w-4" />
                          ) : (
                            <PlayIcon className="h-4 w-4" />
                          )}
                        </Button>
                      </Tooltip>
                      <Tooltip label={t('translation.language.retire')}>
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label={t('translation.language.retire')}
                          disabled={retire.isPending}
                          onClick={() =>
                            retire.mutate({ code: lang.code }, { onSuccess: () => router.refresh() })
                          }
                        >
                          <TrashIcon className="h-4 w-4 text-danger" />
                        </Button>
                      </Tooltip>
                    </div>
                  )}
                </DataTableCell>
              </DataTableRow>
            ))}
          </DataTableBody>
        </DataTable>
      )}
    </div>
  );
}
