'use client';

import { useEffect, useState, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { newDraftBodySchema, type NewDraftBody, updatePagePropertiesSchema, type UpdatePagePropertiesInput } from '@next-wiki/shared';
import { apiPost, apiPatch, type ApiError } from '@/lib/api/client';
import { useHistory } from '@/lib/history';
import { useSetEditor } from '@/components/editor/EditorContext';
import { getApiPageEditUrl, getApiPagePropertiesUrl, getHistoryHref, getPageHref } from '@/lib/path';
import { SplitMarkdownEditor } from '@/components/editor/SplitMarkdownEditor';
import { PagePropertiesPanel } from '@/components/editor/PagePropertiesPanel';
import { Alert } from '@/components/ui/Alert';

export function EditPageForm({ path, initial }: { path: string; initial: { title: string; contentSource: string; canPublish: boolean; latestVersion: number } }) {
  const setEditor = useSetEditor();
  const { goBack } = useHistory();
  const [serverError, setServerError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [propertiesOpen, setPropertiesOpen] = useState(false);
  const [newPath, setNewPath] = useState(path);

  const {
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<NewDraftBody>({
    resolver: zodResolver(newDraftBodySchema),
    defaultValues: { title: initial.title, contentSource: initial.contentSource },
  });

  const title = watch('title');
  const contentSource = watch('contentSource');

  const onSubmit = useCallback(
    async (data: NewDraftBody) => {
      setServerError(null);
      setIsSaving(true);
      try {
        let editPath = path;
        if (newPath !== path) {
          const parsed = updatePagePropertiesSchema.safeParse({ path: newPath });
          if (!parsed.success) {
            setServerError('The new path is invalid.');
            setIsSaving(false);
            return;
          }
          const res = await apiPatch<UpdatePagePropertiesInput, { newPath: string }>(getApiPagePropertiesUrl(path), parsed.data);
          editPath = res.newPath;
        }
        await apiPost<NewDraftBody, { versionId: string; versionNumber: number }>(getApiPageEditUrl(editPath), data);
        window.location.href = getHistoryHref(editPath);
      } catch (err) {
        const error = err as ApiError;
        if (error.code === 'CONFLICT') {
          setServerError('A page with this path already exists.');
        } else if (error.code === 'FORBIDDEN' || error.code === 'UNAUTHORIZED') {
          setServerError('You do not have permission to edit this page.');
        } else {
          setServerError(error.message || 'Failed to save changes.');
        }
      } finally {
        setIsSaving(false);
      }
    },
    [path, newPath],
  );

  const save = useCallback(() => {
    handleSubmit(onSubmit)();
  }, [handleSubmit, onSubmit]);

  const close = useCallback(() => {
    goBack(getPageHref(path));
  }, [goBack, path]);

  const toggleProperties = useCallback(() => {
    setPropertiesOpen((open) => !open);
  }, []);

  useEffect(() => {
    setEditor({
      title: title || '',
      defaultTitle: 'Untitled',
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
            path={newPath}
            onPathChange={setNewPath}
            pathError={newPath !== path && !updatePagePropertiesSchema.safeParse({ path: newPath }).success ? 'Invalid path' : undefined}
          />
        )}
      </div>
    </form>
  );
}
