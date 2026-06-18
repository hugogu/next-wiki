'use client';

import { useEffect, useState, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { createPageInputSchema, type CreatePageInput } from '@next-wiki/shared';
import { apiPost, type ApiError } from '@/lib/api/client';
import { useHistory } from '@/lib/history';
import { useSetEditor } from '@/components/editor/EditorContext';
import { getPageHref } from '@/lib/path';
import { SplitMarkdownEditor } from '@/components/editor/SplitMarkdownEditor';
import { PagePropertiesPanel } from '@/components/editor/PagePropertiesPanel';
import { Alert } from '@/components/ui/Alert';

export function CreatePageForm() {
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
  } = useForm<CreatePageInput>({
    resolver: zodResolver(createPageInputSchema),
    defaultValues: { path: '', title: '', contentSource: '' },
  });

  const title = watch('title');
  const path = watch('path');
  const contentSource = watch('contentSource');

  const onSubmit = useCallback(
    async (data: CreatePageInput) => {
      setServerError(null);
      setIsSaving(true);
      try {
        await apiPost<CreatePageInput, { pageId: string; versionId: string }>('/api/pages', data);
        window.location.href = getPageHref(data.path);
      } catch (err) {
        const error = err as ApiError;
        if (error.code === 'CONFLICT') {
          setServerError('A page with this path already exists.');
        } else if (error.code === 'FORBIDDEN' || error.code === 'UNAUTHORIZED') {
          setServerError('You do not have permission to create pages.');
        } else {
          setServerError(error.message || 'Failed to create page.');
        }
      } finally {
        setIsSaving(false);
      }
    },
    [],
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
      defaultTitle: 'Create a new page',
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
