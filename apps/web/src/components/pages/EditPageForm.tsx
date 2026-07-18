'use client';

import { useEffect, useState, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  newDraftBodySchema,
  type NewDraftBody,
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
import { getPublicApiPageDraftsUrl, getPublicApiPageUrl, getSpaceHref, type ReaderSpace } from '@/lib/path';
import { SplitMarkdownEditor } from '@/components/editor/SplitMarkdownEditor';
import { PagePropertiesPanel } from '@/components/editor/PagePropertiesPanel';
import { Alert } from '@/components/ui/Alert';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { buildDraftBody } from '@/lib/page-frontmatter';

type EditPageInitial = {
  pageId: string;
  revisionId: string;
  title: string;
  contentSource: string;
  canPublish: boolean;
  canDelete: boolean;
  latestVersion: number;
  metadata: { date: string | null; summary: string | null; tags: Array<{ name: string }> };
  writeMetadataToFrontmatter: boolean;
};

export function EditPageForm({ path, initial, space = 'wiki' }: { path: string; initial: EditPageInitial; space?: ReaderSpace }) {
  const { t } = useTranslation();
  const setEditor = useSetEditor();
  const { goBack } = useHistory();
  const [serverError, setServerError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [propertiesOpen, setPropertiesOpen] = useState(false);
  const [propertiesError, setPropertiesError] = useState<string | null>(null);
  const [propertiesSaving, setPropertiesSaving] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [newPath, setNewPath] = useState(path);
  // The path + revision id of the last successful properties PATCH. The page
  // editor uses these for navigation and as the baseRevisionId for the
  // subsequent draft save (which fails with STALE_REVISION if title was just
  // updated through PATCH).
  const [committedPath, setCommittedPath] = useState(path);
  const [committedRevisionId, setCommittedRevisionId] = useState(initial.revisionId);
  const [initialMetadata] = useState(() => ({
    date: initial.metadata.date ?? '',
    summary: initial.metadata.summary ?? '',
    tags: initial.metadata.tags.map((tag) => tag.name).join(', '),
  }));
  const [metadata, setMetadata] = useState(initialMetadata);
  // Initialized from the page's persisted preference (022) rather than
  // re-guessed from content, so this dialog and the admin one always agree.
  const [writeMetadataToFrontmatter, setWriteMetadataToFrontmatter] = useState(initial.writeMetadataToFrontmatter);

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
        const draftBody = buildDraftBody({
          title: data.title,
          contentSource: data.contentSource,
          metadata,
          baseline: { title: initial.title, metadata: initialMetadata },
          writeMetadataToFrontmatter,
          baseRevisionId: committedRevisionId,
        });
        await apiPost<PublicDraftCreateInput, PublicRevisionResource>(getPublicApiPageDraftsUrl(initial.pageId), draftBody);
        window.location.href = getSpaceHref(space, committedPath);
      } catch (err) {
        const error = err as ApiError;
        if (error.code === 'STALE_REVISION') {
          // The properties panel already saved a new revision mid-edit; the
          // user needs to retry so we resync to the latest base.
          setServerError(t('page.edit.error.stale'));
        } else if (error.code === 'FORBIDDEN' || error.code === 'UNAUTHORIZED') {
          setServerError(t('page.edit.error.forbidden'));
        } else {
          setServerError(error.message || t('page.edit.error.generic'));
        }
      } finally {
        setIsSaving(false);
      }
    },
    [committedPath, committedRevisionId, initial.pageId, initial.title, initialMetadata, metadata, space, t, writeMetadataToFrontmatter],
  );

  const handleSaveProperties = useCallback(async () => {
    setPropertiesError(null);
    const pathChanged = newPath !== committedPath;
    if (!pathChanged) {
      // Nothing on the path side has actually changed since the last commit
      // (title edits in this panel save with the next draft). Just close.
      setPropertiesOpen(false);
      return;
    }
    const parsed = updatePagePropertiesSchema.safeParse({ path: newPath });
    if (!parsed.success) {
      setPropertiesError(parsed.error.issues[0]?.message ?? t('page.edit.error.invalidPath'));
      return;
    }
    setPropertiesSaving(true);
    try {
      const body = publicPagePropertiesInputSchema.parse({
        path: parsed.data.path,
        baseRevisionId: committedRevisionId,
      });
      const res = await apiPatch<PublicPagePropertiesInput, PublicPageResource>(
        `${getPublicApiPageUrl(initial.pageId)}?include=latestRevision`,
        body,
      );
      setCommittedPath(res.path);
      setNewPath(res.path);
      setCommittedRevisionId(res.latestRevision?.id ?? committedRevisionId);
      setPropertiesOpen(false);
    } catch (err) {
      const error = err as ApiError;
      if (error.code === 'CONFLICT' || error.code === 'PAGE_PATH_CONFLICT') {
        setPropertiesError(t('page.properties.error.pathExists'));
      } else if (error.code === 'PAGE_PATH_RESERVED') {
        setPropertiesError(t('page.properties.error.pathReserved'));
      } else if (error.code === 'FORBIDDEN' || error.code === 'UNAUTHORIZED') {
        setPropertiesError(t('page.properties.error.forbidden'));
      } else if (error.code === 'STALE_REVISION') {
        setPropertiesError(t('page.edit.error.stale'));
      } else {
        setPropertiesError(error.message || t('page.properties.error.generic'));
      }
    } finally {
      setPropertiesSaving(false);
    }
  }, [newPath, committedPath, committedRevisionId, initial.pageId, t]);

  const save = useCallback(() => {
    handleSubmit(onSubmit)();
  }, [handleSubmit, onSubmit]);

  const close = useCallback(() => {
    goBack(getSpaceHref(space, committedPath));
  }, [goBack, committedPath, space]);

  const toggleProperties = useCallback(() => {
    setPropertiesError(null);
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
      window.location.href = getSpaceHref(space);
    } catch (err) {
      const error = err as ApiError;
      setDeleteError(error.message || t('editor.delete.error'));
      setIsDeleting(false);
    }
  }, [initial.pageId, space, t]);

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
            pathError={
              newPath !== committedPath && !updatePagePropertiesSchema.safeParse({ path: newPath }).success
                ? t('page.edit.validation.invalidPath')
                : undefined
            }
            date={metadata.date}
            onDateChange={(date) => setMetadata((current) => ({ ...current, date }))}
            tags={metadata.tags}
            onTagsChange={(tags) => setMetadata((current) => ({ ...current, tags }))}
            summary={metadata.summary}
            onSummaryChange={(summary) => setMetadata((current) => ({ ...current, summary }))}
            writeMetadataToFrontmatter={writeMetadataToFrontmatter}
            onWriteMetadataToFrontmatterChange={setWriteMetadataToFrontmatter}
            error={propertiesError}
            saving={propertiesSaving}
            onSave={handleSaveProperties}
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
