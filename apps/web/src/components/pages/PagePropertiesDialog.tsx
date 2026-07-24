'use client';

import { useState } from 'react';
import type { PublicPageMetadataInput, PublicPageResource } from '@next-wiki/shared';
import { ModalDialog } from '@/components/ui/ModalDialog';
import { Button } from '@/components/ui/Button';
import { apiPatch, apiPost, type ApiError } from '@/lib/api/client';
import { useTranslation } from '@/i18n/client';
import { getPublicApiPageMetadataUrl, getPublicApiPagePublicationUrl } from '@/lib/path';

type Props = {
  pageId: string;
  revisionId: string;
  initialTitle: string;
  initialDate: string | null;
  initialSummary: string | null;
  onClose: () => void;
};

/**
 * Reader-page properties dialog. Edits title / date / summary through the
 * public metadata endpoint, which drafts a new revision, then publishes it so
 * the change is reflected immediately on the live page.
 */
export function PagePropertiesDialog({
  pageId,
  revisionId,
  initialTitle,
  initialDate,
  initialSummary,
  onClose,
}: Props) {
  const { t } = useTranslation();
  const [title, setTitle] = useState(initialTitle);
  const [date, setDate] = useState(initialDate ?? '');
  const [summary, setSummary] = useState(initialSummary ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const body = {
        baseRevisionId: revisionId,
        title: title.trim() || initialTitle,
        date: date ? date : null,
        summary: summary.trim() ? summary.trim() : null,
      } satisfies PublicPageMetadataInput;
      const updated = await apiPatch<PublicPageMetadataInput, PublicPageResource>(
        `${getPublicApiPageMetadataUrl(pageId)}?include=latestRevision`,
        body,
      );
      // The metadata endpoint drafts a revision; publish it so the reader
      // reflects the change. If publishing is not permitted, the draft still
      // exists and a full reload surfaces whatever the viewer may see.
      const version = updated.latestRevision?.version;
      if (version != null) {
        try {
          await apiPost<Record<string, never>, unknown>(
            getPublicApiPagePublicationUrl(pageId, version),
            {},
          );
        } catch {
          // Non-fatal: the metadata draft was saved; publishing may require
          // additional permissions. Reload so any partial state is visible.
        }
      }
      window.location.reload();
    } catch (err) {
      const apiError = err as ApiError;
      setError(apiError.message || t('page.properties.error.generic'));
      setSaving(false);
    }
  }

  return (
    <ModalDialog title={t('page.properties.dialog.title')} description={t('page.properties.dialog.description')} onClose={onClose} maxWidth="max-w-xl">
      <form onSubmit={handleSubmit} className="space-y-md">
        <div className="space-y-xs">
          <label htmlFor="page-settings-title" className="block text-sm font-medium text-foreground">
            {t('editor.properties.fields.titleLabel')}
          </label>
          <input
            id="page-settings-title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t('editor.properties.fields.titlePlaceholder')}
            className="w-full rounded-md border border-border bg-background px-sm py-sm text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
        </div>
        <div className="space-y-xs">
          <label htmlFor="page-settings-date" className="block text-sm font-medium text-foreground">
            {t('editor.properties.fields.dateLabel')}
          </label>
          <input
            id="page-settings-date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full rounded-md border border-border bg-background px-sm py-sm text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
        </div>
        <div className="space-y-xs">
          <label htmlFor="page-settings-summary" className="block text-sm font-medium text-foreground">
            {t('editor.properties.fields.summaryLabel')}
          </label>
          <textarea
            id="page-settings-summary"
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            rows={3}
            className="min-h-24 w-full rounded-md border border-border bg-background px-sm py-sm text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
        </div>
        {error && <p className="text-sm text-danger">{error}</p>}
        <div className="flex justify-end gap-sm pt-xs">
          <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>
            {t('common.actions.cancel')}
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? t('page.properties.button.submitting') : t('page.properties.button.submit')}
          </Button>
        </div>
      </form>
    </ModalDialog>
  );
}
