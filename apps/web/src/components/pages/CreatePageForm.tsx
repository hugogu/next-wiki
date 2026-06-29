'use client';

import { useEffect, useState, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { publicPageCreateInputSchema, type PublicPageCreateInput, type PublicPageResource } from '@next-wiki/shared';
import { useTranslation } from '@/i18n/client';
import { apiPost, type ApiError } from '@/lib/api/client';
import { useHistory } from '@/lib/history';
import { useSetEditor } from '@/components/editor/EditorContext';
import { getPageHref, getPublicApiPagesUrl } from '@/lib/path';
import { SplitMarkdownEditor } from '@/components/editor/SplitMarkdownEditor';
import { PagePropertiesPanel } from '@/components/editor/PagePropertiesPanel';
import { Alert } from '@/components/ui/Alert';

export function CreatePageForm() {
  const { t } = useTranslation();
  const setEditor = useSetEditor();
  const { goBack } = useHistory();
  const [serverError, setServerError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [propertiesOpen, setPropertiesOpen] = useState(false);

  const {
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<PublicPageCreateInput>({
    resolver: zodResolver(publicPageCreateInputSchema),
    defaultValues: { path: '', title: '', contentSource: '' },
  });

  const title = watch('title');
  const path = watch('path');
  const contentSource = watch('contentSource');

  const onSubmit = useCallback(
    async (data: PublicPageCreateInput) => {
      setServerError(null);
      setIsSaving(true);
      try {
        await apiPost<PublicPageCreateInput, PublicPageResource>(getPublicApiPagesUrl(), data);
        window.location.href = getPageHref(data.path);
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
    [t],
  );

  const save = useCallback(() => {
    handleSubmit(onSubmit)();
  }, [handleSubmit, onSubmit]);

  const close = useCallback(() => {
    goBack('/');
  }, [goBack]);

  const toggleProperties = useCallback(() => {
    setPropertiesOpen((open) => !open);
  }, []);

  useEffect(() => {
    setEditor({
      title: title || '',
      defaultTitle: t('page.create.defaultTitle'),
      isSaving,
      propertiesOpen,
      toggleProperties,
      save,
      close,
    });
    return () => setEditor(null);
  }, [
    title,
    isSaving,
    propertiesOpen,
    toggleProperties,
    save,
    close,
    setEditor,
    t,
  ]);

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="h-full flex flex-col relative"
    >
      {serverError && (
        <div className="shrink-0 px-lg py-sm">
          <Alert>{serverError}</Alert>
        </div>
      )}

      <div className="flex-1 overflow-hidden relative">
        <SplitMarkdownEditor
          value={contentSource}
          onChange={(v) => setValue('contentSource', v, { shouldValidate: true })}
          disabled={isSaving}
        />

        {propertiesOpen && (
          <PagePropertiesPanel
            title={title}
            onTitleChange={(v) => setValue('title', v, { shouldValidate: true })}
            titleError={errors.title?.message}
            path={path}
            onPathChange={(v) => setValue('path', v, { shouldValidate: true })}
            pathError={errors.path?.message}
          />
        )}
      </div>
    </form>
  );
}
