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
import { apiPost, apiPatch, apiDelete, type ApiError } from '@/lib/api/client';
import { useHistory } from '@/lib/history';
import { useSetEditor } from '@/components/editor/EditorContext';
import { getPublicApiPageDraftsUrl, getPublicApiPageUrl, getHistoryHref, getPageHref } from '@/lib/path';
import { SplitMarkdownEditor } from '@/components/editor/SplitMarkdownEditor';
import { PagePropertiesPanel } from '@/components/editor/PagePropertiesPanel';
import { Alert } from '@/components/ui/Alert';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { hasEditorFrontmatter, writeEditorMetadata } from '@/lib/page-frontmatter';

type EditPageInitial = {
  pageId: string;
  revisionId: string;
  title: string;
  contentSource: string;
  canPublish: boolean;
  canDelete: boolean;
  latestVersion: number;
  metadata: { date: string | null; summary: string | null; tags: Array<{ name: string }> };
};

export function EditPageForm({ path, initial }: { path: string; initial: EditPageInitial }) {
  const { t } = useTranslation();
  const setEditor = useSetEditor();
  const { goBack } = useHistory();
  const [serverError, setServerError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [propertiesOpen, setPropertiesOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [newPath, setNewPath] = useState(path);
  const [initialMetadata] = useState(() => ({
    date: initial.metadata.date ?? '',
    summary: initial.metadata.summary ?? '',
    tags: initial.metadata.tags.map((tag) => tag.name).join(', '),
  }));
  const [metadata, setMetadata] = useState(initialMetadata);
  const [writeMetadataToFrontmatter, setWriteMetadataToFrontmatter] = useState(() => hasEditorFrontmatter(initial.contentSource));
  const [frontmatterPreferenceTouched, setFrontmatterPreferenceTouched] = useState(false);

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
        const contentSource = writeMetadataToFrontmatter
          ? writeEditorMetadata(data.contentSource, data.title, metadata, {
              title: initial.title,
              metadata: initialMetadata,
            }, { forceFrontmatter: !hasEditorFrontmatter(data.contentSource) })
          : data.contentSource;
        const draftBody = publicDraftCreateInputSchema.parse({
          ...data,
          contentSource,
          metadata: writeMetadataToFrontmatter ? undefined : {
            date: metadata.date.trim() || null,
            summary: metadata.summary.trim() || null,
            tags: metadata.tags.split(',').map((tag) => tag.trim()).filter(Boolean),
          },
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
    [path, newPath, initial.revisionId, initial.pageId, initial.title, initialMetadata, metadata, t, writeMetadataToFrontmatter],
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

  const requestDelete = useCallback(() => {
    setDeleteError(null);
    setDeleteOpen(true);
  }, []);

  const handleDelete = useCallback(async () => {
    setIsDeleting(true);
    setDeleteError(null);
    try {
      await apiDelete<void>(getPublicApiPageUrl(initial.pageId));
      window.location.href = '/';
    } catch (err) {
      const error = err as ApiError;
      setDeleteError(error.message || t('editor.delete.error'));
      setIsDeleting(false);
    }
  }, [initial.pageId, t]);

  useEffect(() => {
    setEditor({
      title: title || '',
      defaultTitle: t('page.edit.defaultTitle'),
      isSaving,
      propertiesOpen,
      toggleProperties,
      save,
      close,
      canDelete: initial.canDelete,
      requestDelete,
    });
    return () => setEditor(null);
  }, [
    title,
    isSaving,
    propertiesOpen,
    toggleProperties,
    save,
    close,
    initial.canDelete,
    requestDelete,
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
          onChange={(v) => {
            setValue('contentSource', v, { shouldValidate: true });
            if (!frontmatterPreferenceTouched) setWriteMetadataToFrontmatter(hasEditorFrontmatter(v));
          }}
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
            date={metadata.date}
            onDateChange={(date) => setMetadata((current) => ({ ...current, date }))}
            tags={metadata.tags}
            onTagsChange={(tags) => setMetadata((current) => ({ ...current, tags }))}
            summary={metadata.summary}
            onSummaryChange={(summary) => setMetadata((current) => ({ ...current, summary }))}
            writeMetadataToFrontmatter={writeMetadataToFrontmatter}
            onWriteMetadataToFrontmatterChange={(value) => {
              setFrontmatterPreferenceTouched(true);
              setWriteMetadataToFrontmatter(value);
            }}
            onClose={toggleProperties}
          />
        )}
      </div>

      {deleteOpen && (
        <ConfirmDialog
          title={t('editor.delete.title')}
          message={t('editor.delete.message', { title: initial.title })}
          confirmLabel={t('editor.delete.confirm')}
          confirmVariant="danger"
          pending={isDeleting}
          error={deleteError ?? undefined}
          onConfirm={handleDelete}
          onCancel={() => {
            if (!isDeleting) setDeleteOpen(false);
          }}
        />
      )}
    </form>
  );
}
