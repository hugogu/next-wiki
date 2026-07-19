'use client';

import { useCallback, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  newPageDialogInputSchema,
  publicPageCreateInputSchema,
  type NewPageDialogInput,
  type PublicPageCreateInput,
  type PublicPageResource,
  type RawInputKind,
} from '@next-wiki/shared';
import { useTranslation } from '@/i18n/client';
import { apiPost, type ApiError } from '@/lib/api/client';
import { getPublicApiPagesUrl } from '@/lib/path';
import { ModalDialog } from '@/components/ui/ModalDialog';
import { PagePropertiesFields } from '@/components/editor/PagePropertiesFields';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import type { ReaderSpace } from '@/lib/path';

export function NewPageDialog({
  onClose,
  onCreated,
  initialPathPrefix,
  space = 'wiki',
}: {
  onClose: () => void;
  onCreated: (path: string) => void;
  /** Optional path prefix to pre-fill, e.g. "ai/apps" → path starts "ai/apps/". */
  initialPathPrefix?: string;
  space?: ReaderSpace;
}) {
  const { t } = useTranslation();
  const [serverError, setServerError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [rawContent, setRawContent] = useState('');
  const [rawInputKind, setRawInputKind] = useState<RawInputKind>('manual-note');
  const isRaw = space === 'raw';

  const {
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<NewPageDialogInput>({
    resolver: zodResolver(newPageDialogInputSchema),
    defaultValues: { path: initialPathPrefix ? `${initialPathPrefix}/` : '', title: '' },
  });

  const title = watch('title');
  const path = watch('path');

  const onSubmit = useCallback(
    async (data: NewPageDialogInput) => {
      setServerError(null);
      if (isRaw && !rawContent.trim()) {
        setServerError(t('page.create.error.rawContentRequired'));
        return;
      }
      setIsSaving(true);
      try {
        const input = publicPageCreateInputSchema.parse({
          ...data,
          ...(space === 'wiki' ? {} : { space }),
          ...(isRaw ? { contentSource: rawContent, inputKind: rawInputKind } : {}),
        });
        const result = await apiPost<PublicPageCreateInput, PublicPageResource>(getPublicApiPagesUrl(), input);
        onCreated(result.path);
      } catch (err) {
        const error = err as ApiError;
        if (error.code === 'CONFLICT') {
          setServerError(t('page.create.error.pathExists'));
        } else if (error.code === 'PAGE_PATH_RESERVED') {
          setServerError(t('page.create.error.pathReserved'));
        } else if (error.code === 'FORBIDDEN' || error.code === 'UNAUTHORIZED') {
          setServerError(t('page.create.error.forbidden'));
        } else if (error.code === 'RAW_CATEGORY_REQUIRED') {
          setServerError(t('page.create.error.rawCategoryRequired'));
        } else {
          setServerError(error.message || t('page.create.error.generic'));
        }
      } finally {
        setIsSaving(false);
      }
    },
    [isRaw, onCreated, rawContent, rawInputKind, space, t],
  );

  return (
    <ModalDialog title={t('page.create.metadataTitle')} onClose={onClose} maxWidth="max-w-md">
      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-md">
        {serverError && <Alert>{serverError}</Alert>}
        <PagePropertiesFields
          title={title}
          onTitleChange={(v) => setValue('title', v, { shouldValidate: true })}
          titleError={errors.title?.message}
          path={path}
          onPathChange={(v) => setValue('path', v, { shouldValidate: true })}
          pathError={errors.path?.message}
        />
        {isRaw && (
          <>
            <label className="block space-y-xs">
              <span className="text-sm font-medium">{t('page.create.rawInputKind')}</span>
              <select
                value={rawInputKind}
                onChange={(event) => setRawInputKind(event.target.value as RawInputKind)}
                className="w-full rounded-md border border-border bg-background px-sm py-sm text-sm"
              >
                <option value="manual-note">{t('page.create.rawKinds.manualNote')}</option>
                <option value="chat-transcript">{t('page.create.rawKinds.chatTranscript')}</option>
                <option value="external-fetch">{t('page.create.rawKinds.externalFetch')}</option>
                <option value="script-run">{t('page.create.rawKinds.scriptRun')}</option>
              </select>
            </label>
            <label className="block space-y-xs">
              <span className="text-sm font-medium">{t('page.create.rawContent')}</span>
              <textarea
                value={rawContent}
                onChange={(event) => setRawContent(event.target.value)}
                className="min-h-40 w-full rounded-md border border-border bg-background px-sm py-sm text-sm text-foreground"
                required
              />
            </label>
          </>
        )}
        <div className="flex justify-end gap-sm">
          <Button type="button" variant="secondary" onClick={onClose} disabled={isSaving}>
            {t('common.actions.cancel')}
          </Button>
          <Button type="submit" disabled={isSaving}>
            {t('page.create.submit')}
          </Button>
        </div>
      </form>
    </ModalDialog>
  );
}
