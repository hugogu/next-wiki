'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  publicPagePropertiesInputSchema,
  updatePagePropertiesSchema,
  type PublicPagePropertiesInput,
  type PublicPageResource,
  type PublicDraftCreateInput,
  type PublicRevisionResource,
} from '@next-wiki/shared';
import { SettingsIcon } from '@/components/icons';
import { PagePropertiesPanel } from '@/components/editor/PagePropertiesPanel';
import { useTranslation } from '@/i18n/client';
import { apiGet, apiPost, apiPatch, type ApiError } from '@/lib/api/client';
import { getPublicApiPageUrl, getPublicApiPageDraftsUrl } from '@/lib/path';
import { getLocalizedErrorMessage } from '@/i18n/error-messages';
import { buildDraftBody, type EditorMetadata } from '@/lib/page-frontmatter';

type Loaded = {
  contentSource: string;
  baseRevisionId?: string;
  baseline: { title: string; metadata: EditorMetadata };
  writeMetadataToFrontmatter: boolean;
};

/**
 * Admin-list "properties" action. Opens the same dialog the split editor uses,
 * with the identical field set (title, path, date, tags, summary, frontmatter
 * preference), and saves through the same shared draft path so the two dialogs
 * behave identically.
 */
export function PagePropertiesButton({
  pageId,
  initialTitle,
  initialPath,
}: {
  pageId: string;
  initialTitle: string;
  initialPath: string;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState(initialTitle);
  const [path, setPath] = useState(initialPath);
  const [date, setDate] = useState('');
  const [summary, setSummary] = useState('');
  const [tags, setTags] = useState('');
  const [writeMetadataToFrontmatter, setWriteMetadataToFrontmatter] = useState(false);
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  const openDialog = async () => {
    setError(null);
    setOpen(true);
    setLoading(true);
    try {
      const page = await apiGet<PublicPageResource>(`${getPublicApiPageUrl(pageId)}?include=latestRevision`);
      const metadata: EditorMetadata = {
        date: page.metadata?.date ?? '',
        summary: page.metadata?.summary ?? '',
        tags: (page.metadata?.tags ?? []).map((tag) => tag.name).join(', '),
      };
      setTitle(page.title);
      setPath(page.path);
      setDate(metadata.date);
      setSummary(metadata.summary);
      setTags(metadata.tags);
      setWriteMetadataToFrontmatter(page.writeMetadataToFrontmatter ?? false);
      setLoaded({
        contentSource: page.contentSource ?? '',
        baseRevisionId: page.latestRevision?.id,
        baseline: { title: page.title, metadata },
        writeMetadataToFrontmatter: page.writeMetadataToFrontmatter ?? false,
      });
    } catch (err) {
      setError(getLocalizedErrorMessage(t, err as ApiError, 'page.properties.error.generic'));
    } finally {
      setLoading(false);
    }
  };

  const mapError = (err: ApiError) => {
    if (err.code === 'STALE_REVISION') return t('page.edit.error.stale');
    if (err.code === 'CONFLICT' || err.code === 'PAGE_PATH_CONFLICT') return t('page.properties.error.pathExists');
    if (err.code === 'PAGE_PATH_RESERVED') return t('page.properties.error.pathReserved');
    if (err.code === 'FORBIDDEN' || err.code === 'UNAUTHORIZED') return t('page.properties.error.forbidden');
    return getLocalizedErrorMessage(t, err, 'page.properties.error.generic');
  };

  const save = async () => {
    if (!loaded) return;
    const pathChanged = path !== initialPath;
    const contentChanged =
      title !== loaded.baseline.title ||
      date !== loaded.baseline.metadata.date ||
      summary !== loaded.baseline.metadata.summary ||
      tags !== loaded.baseline.metadata.tags ||
      writeMetadataToFrontmatter !== loaded.writeMetadataToFrontmatter;

    if (!pathChanged && !contentChanged) {
      setOpen(false);
      return;
    }

    setError(null);
    setSaving(true);
    try {
      // Path is page-level identity; rename it first (does not add a revision,
      // so the draft's baseRevisionId below stays valid).
      if (path !== initialPath) {
        const parsedPath = publicPagePropertiesInputSchema.safeParse({ path });
        if (!parsedPath.success) {
          setError(t('page.properties.error.generic'));
          setSaving(false);
          return;
        }
        await apiPatch<PublicPagePropertiesInput, PublicPageResource>(getPublicApiPageUrl(pageId), parsedPath.data);
      }

      if (contentChanged) {
        const draftBody = buildDraftBody({
          title,
          contentSource: loaded.contentSource,
          metadata: { date, summary, tags },
          baseline: loaded.baseline,
          writeMetadataToFrontmatter,
          baseRevisionId: loaded.baseRevisionId,
        });
        await apiPost<PublicDraftCreateInput, PublicRevisionResource>(getPublicApiPageDraftsUrl(pageId), draftBody);
      }

      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(mapError(err as ApiError));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={openDialog}
        aria-label={t('admin.pages.actions.properties')}
        title={t('admin.pages.actions.properties')}
        className="inline-flex h-9 w-9 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-elevated hover:text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
      >
        <SettingsIcon />
      </button>
      {open && (
        <PagePropertiesPanel
          title={title}
          onTitleChange={setTitle}
          path={path}
          onPathChange={setPath}
          pathError={
            path !== initialPath && !updatePagePropertiesSchema.safeParse({ path }).success
              ? t('page.edit.validation.invalidPath')
              : undefined
          }
          date={date}
          onDateChange={setDate}
          tags={tags}
          onTagsChange={setTags}
          summary={summary}
          onSummaryChange={setSummary}
          writeMetadataToFrontmatter={writeMetadataToFrontmatter}
          onWriteMetadataToFrontmatterChange={setWriteMetadataToFrontmatter}
          error={error}
          saving={loading || saving}
          onSave={save}
          onClose={() => {
            if (!saving) setOpen(false);
          }}
        />
      )}
    </>
  );
}
