'use client';

import { useCallback, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { newPageDialogInputSchema, type NewPageDialogInput, type PublicPageResource } from '@next-wiki/shared';
import { useTranslation } from '@/i18n/client';
import { apiPost, type ApiError } from '@/lib/api/client';
import { getPublicApiPagesUrl } from '@/lib/path';
import { ModalDialog } from '@/components/ui/ModalDialog';
import { PagePropertiesFields } from '@/components/editor/PagePropertiesFields';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';

export function NewPageDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (path: string) => void;
}) {
  const { t } = useTranslation();
  const [serverError, setServerError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const {
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<NewPageDialogInput>({
    resolver: zodResolver(newPageDialogInputSchema),
    defaultValues: { path: '', title: '' },
  });

  const title = watch('title');
  const path = watch('path');

  const onSubmit = useCallback(
    async (data: NewPageDialogInput) => {
      setServerError(null);
      setIsSaving(true);
      try {
        const result = await apiPost<NewPageDialogInput, PublicPageResource>(getPublicApiPagesUrl(), data);
        onCreated(result.path);
      } catch (err) {
        const error = err as ApiError;
        if (error.code === 'CONFLICT') {
          setServerError(t('page.create.error.pathExists'));
        } else if (error.code === 'FORBIDDEN' || error.code === 'UNAUTHORIZED') {
          setServerError(t('page.create.error.forbidden'));
        } else {
          setServerError(error.message || t('page.create.error.generic'));
        }
      } finally {
        setIsSaving(false);
      }
    },
    [onCreated, t],
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
