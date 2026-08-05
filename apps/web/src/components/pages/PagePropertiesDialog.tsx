'use client';

import { useState } from 'react';
import {
  publicPageMetadataInputSchema,
  publicPagePropertiesInputSchema,
  updatePagePropertiesSchema,
  type PublicPageResource,
} from '@next-wiki/shared';
import { PagePropertiesPanel } from '@/components/editor/PagePropertiesPanel';
import { apiPatch, apiPost, apiPut, type ApiError } from '@/lib/api/client';
import { useTranslation } from '@/i18n/client';
import {
  getPublicApiPageMetadataUrl,
  getPublicApiPagePublicationUrl,
  getPublicApiPageUrl,
} from '@/lib/path';

type Props = {
  pageId: string;
  revisionId: string;
  initialTitle: string;
  initialPath: string;
  initialDate: string | null;
  initialTags: string[];
  initialSummary: string | null;
  initialVisibility?: 'public' | 'restricted';
  canSetVisibility?: boolean;
  pathReadOnly?: boolean;
  onSaved: (path: string) => void;
  onClose: () => void;
};

/**
 * Reader-page properties use the same field component as the editor. Reader
 * saves write the supported metadata and path directly, while the editor keeps
 * the frontmatter preference because it owns the Markdown source.
 */
export function PagePropertiesDialog({
  pageId,
  revisionId,
  initialTitle,
  initialPath,
  initialDate,
  initialTags,
  initialSummary,
  initialVisibility,
  canSetVisibility = false,
  pathReadOnly = false,
  onSaved,
  onClose,
}: Props) {
  const { t } = useTranslation();
  const [title, setTitle] = useState(initialTitle);
  const [path, setPath] = useState(initialPath);
  const [date, setDate] = useState(initialDate ?? '');
  const [tags, setTags] = useState(initialTags.join(', '));
  const [summary, setSummary] = useState(initialSummary ?? '');
  const [visibility, setVisibility] = useState(initialVisibility);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    const normalizedTags = tags.split(',').map((tag) => tag.trim()).filter(Boolean);
    const metadataChanged =
      title.trim() !== initialTitle
      || date !== (initialDate ?? '')
      || summary !== (initialSummary ?? '')
      || normalizedTags.join(',') !== initialTags.join(',');
    const pathChanged = !pathReadOnly && path !== initialPath;
    const visibilityChanged = canSetVisibility && visibility !== initialVisibility;

    if (!metadataChanged && !pathChanged && !visibilityChanged) {
      onClose();
      return;
    }

    if (pathChanged) {
      const parsedPath = updatePagePropertiesSchema.safeParse({ path });
      if (!parsedPath.success) {
        setError(parsedPath.error.issues[0]?.message ?? t('page.edit.error.invalidPath'));
        return;
      }
    }

    setSaving(true);
    setError(null);
    try {
      let latestRevisionId = revisionId;
      let latestVersion: number | undefined;
      let savedPath = path;

      if (metadataChanged) {
        const updated = await apiPatch(
          `${getPublicApiPageMetadataUrl(pageId)}?include=latestRevision`,
          publicPageMetadataInputSchema.parse({
            baseRevisionId: latestRevisionId,
            title: title.trim() || initialTitle,
            date: date || null,
            tags: normalizedTags,
            summary: summary.trim() || null,
          }),
        ) as PublicPageResource;
        latestRevisionId = updated.latestRevision?.id ?? latestRevisionId;
        latestVersion = updated.latestRevision?.version;
      }

      if (pathChanged) {
        const updated = await apiPatch(
          `${getPublicApiPageUrl(pageId)}?include=latestRevision`,
          publicPagePropertiesInputSchema.parse({ path, baseRevisionId: latestRevisionId }),
        ) as PublicPageResource;
        savedPath = updated.path;
        latestRevisionId = updated.latestRevision?.id ?? latestRevisionId;
        latestVersion = updated.latestRevision?.version ?? latestVersion;
      }

      if (latestVersion != null) {
        await apiPost<Record<string, never>, unknown>(
          getPublicApiPagePublicationUrl(pageId, latestVersion),
          {},
        );
      }

      if (visibilityChanged && visibility) {
        await apiPut<{ visibility: 'public' | 'restricted' }, unknown>(
          `/api/pages/${encodeURIComponent(pageId)}/visibility`,
          { visibility },
        );
      }

      onSaved(savedPath);
    } catch (cause) {
      const apiError = cause as ApiError;
      if (apiError.code === 'CONFLICT' || apiError.code === 'PAGE_PATH_CONFLICT') {
        setError(t('page.properties.error.pathExists'));
      } else if (apiError.code === 'PAGE_PATH_RESERVED') {
        setError(t('page.properties.error.pathReserved'));
      } else if (apiError.code === 'FORBIDDEN' || apiError.code === 'UNAUTHORIZED') {
        setError(t('page.properties.error.forbidden'));
      } else {
        setError(apiError.message || t('page.properties.error.generic'));
      }
      setSaving(false);
    }
  }

  return (
    <PagePropertiesPanel
      title={title}
      onTitleChange={setTitle}
      path={pathReadOnly ? undefined : path}
      onPathChange={pathReadOnly ? undefined : setPath}
      date={date}
      onDateChange={setDate}
      tags={tags}
      onTagsChange={setTags}
      summary={summary}
      onSummaryChange={setSummary}
      visibility={canSetVisibility ? visibility : undefined}
      onVisibilityChange={canSetVisibility ? setVisibility : undefined}
      error={error}
      saving={saving}
      onSave={() => void handleSave()}
      onClose={onClose}
    />
  );
}
