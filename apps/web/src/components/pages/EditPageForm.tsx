'use client';

import { useEffect, useState, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  newDraftBodySchema,
  type NewDraftBody,
  publicDraftCreateInputSchema,
  type PublicDraftCreateInput,
  publicPagePropertiesInputSchema,
  type PublicPagePropertiesInput,
  type PublicPageResource,
  type PublicRevisionResource,
  updatePagePropertiesSchema,
} from '@next-wiki/shared';
import { useTranslation } from '@/i18n/client';
import { apiPost, apiPatch, type ApiError } from '@/lib/api/client';
import { useHistory } from '@/lib/history';
import { useSetEditor } from '@/components/editor/EditorContext';
import { getPublicApiPageDraftsUrl, getPublicApiPageUrl, getHistoryHref, getPageHref } from '@/lib/path';
import { SplitMarkdownEditor } from '@/components/editor/SplitMarkdownEditor';
import { PagePropertiesPanel } from '@/components/editor/PagePropertiesPanel';
import { Alert } from '@/components/ui/Alert';

export function EditPageForm({ path, initial }: { path: string; initial: { pageId: string; revisionId: string; title: string; contentSource: string; canPublish: boolean; latestVersion: number } }) {
  const { t } = useTranslation();
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
            setServerError(t('page.edit.error.invalidPath'));
            setIsSaving(false);
            return;
          }
          const body = publicPagePropertiesInputSchema.parse({
            ...parsed.data,
            baseRevisionId: initial.revisionId,
          });
          const res = await apiPatch<PublicPagePropertiesInput, PublicPageResource>(getPublicApiPageUrl(initial.pageId), body);
          editPath = res.path;
        }
        const draftBody = publicDraftCreateInputSchema.parse({
          ...data,
          baseRevisionId: initial.revisionId,
        });
        await apiPost<PublicDraftCreateInput, PublicRevisionResource>(getPublicApiPageDraftsUrl(initial.pageId), draftBody);
        window.location.href = getHistoryHref(editPath);
      } catch (err) {
        const error = err as ApiError;
        if (error.code === 'CONFLICT' || error.code === 'PAGE_PATH_CONFLICT') {
          setServerError(t('page.edit.error.pathExists'));
        } else if (error.code === 'FORBIDDEN' || error.code === 'UNAUTHORIZED') {
          setServerError(t('page.edit.error.forbidden'));
        } else {
          setServerError(error.message || t('page.edit.error.generic'));
        }
      } finally {
        setIsSaving(false);
      }
    },
    [path, newPath, initial.revisionId, initial.pageId, t],
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
      defaultTitle: t('page.edit.defaultTitle'),
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
          pageId={initial.pageId}
          revisionId={initial.revisionId}
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
            pathError={newPath !== path && !updatePagePropertiesSchema.safeParse({ path: newPath }).success ? t('page.edit.validation.invalidPath') : undefined}
          />
        )}
      </div>
    </form>
  );
}
