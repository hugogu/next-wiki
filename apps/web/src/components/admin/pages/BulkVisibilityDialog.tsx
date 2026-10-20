'use client';

import { useEffect, useMemo, useState } from 'react';
import type { BulkPageVisibilityInput, BulkPageVisibilityResult, PageVisibility } from '@next-wiki/shared';
import { Button } from '@/components/ui/Button';
import { ModalDialog } from '@/components/ui/ModalDialog';
import { Select } from '@/components/ui/Select';
import { apiPost, type ApiError } from '@/lib/api/client';
import { useTranslation } from '@/i18n/client';

const BULK_VISIBILITY_URL = '/api/admin/pages/visibility';
const VISIBILITIES = ['public', 'registered', 'restricted'] as const;

type Scope = BulkPageVisibilityInput['scope'];
type DryRun = {
  scope: Scope;
  visibility: PageVisibility;
  attempt: number;
  result?: BulkPageVisibilityResult;
  error?: string;
};

/**
 * Bulk visibility for the Admin page list. A dry run first counts what would
 * change, so the administrator confirms against real numbers and is warned
 * before pages become public (032 FR-004). Applying repeats the request until
 * a folder larger than the per-request limit is done.
 */
export function BulkVisibilityDialog({
  selectedPageIds,
  space,
  spaceLabel,
  folder,
  onClose,
  onDone,
}: {
  selectedPageIds: string[];
  space: string;
  spaceLabel: string;
  folder?: string;
  onClose: () => void;
  onDone: (changed: number, visibility: PageVisibility) => void;
}) {
  const { t } = useTranslation();
  const [scopeKind, setScopeKind] = useState<Scope['kind']>(selectedPageIds.length > 0 ? 'pages' : 'folder');
  const [visibility, setVisibility] = useState<PageVisibility | ''>('');
  // Bumped after a failed apply, so the counts are read again.
  const [attempt, setAttempt] = useState(0);
  const [dryRun, setDryRun] = useState<DryRun | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [applyError, setApplyError] = useState<string | null>(null);

  const scope = useMemo<Scope>(
    () => (scopeKind === 'pages'
      ? { kind: 'pages', pageIds: selectedPageIds }
      : { kind: 'folder', space, ...(folder ? { pathPrefix: folder } : {}) }),
    [scopeKind, selectedPageIds, space, folder],
  );

  useEffect(() => {
    if (!visibility) return;
    const controller = new AbortController();
    apiPost<BulkPageVisibilityInput, BulkPageVisibilityResult>(
      BULK_VISIBILITY_URL,
      { scope, visibility, dryRun: true },
      { signal: controller.signal },
    )
      .then((result) => setDryRun({ scope, visibility, attempt, result }))
      .catch((cause: ApiError) => {
        if (!controller.signal.aborted) setDryRun({ scope, visibility, attempt, error: cause.message ?? '' });
      });
    return () => controller.abort();
  }, [scope, visibility, attempt]);

  const current = dryRun && dryRun.scope === scope && dryRun.visibility === visibility && dryRun.attempt === attempt
    ? dryRun
    : null;
  const preview = current?.result ?? null;
  const pending = preview?.pending.total ?? 0;
  const applying = progress !== null;
  const error = applyError ?? (current?.error !== undefined ? current.error || t('admin.pages.bulk.error') : null);

  async function apply() {
    if (!visibility || !preview) return;
    setApplyError(null);
    setProgress(0);
    let changed = 0;
    try {
      for (;;) {
        const result = await apiPost<BulkPageVisibilityInput, BulkPageVisibilityResult>(
          BULK_VISIBILITY_URL,
          { scope, visibility },
        );
        changed += result.changed;
        setProgress(changed);
        if (result.remaining === 0 || result.changed === 0) break;
      }
      onDone(changed, visibility);
    } catch (cause) {
      const message = (cause as ApiError).message || t('admin.pages.bulk.error');
      setApplyError(changed > 0 ? t('admin.pages.bulk.partialError', { changed, total: pending, message }) : message);
      setProgress(null);
      setAttempt((value) => value + 1);
    }
  }

  return (
    <ModalDialog
      title={t('admin.pages.bulk.title')}
      description={t('admin.pages.bulk.description')}
      onClose={() => {
        if (!applying) onClose();
      }}
      maxWidth="max-w-lg"
    >
      <div className="space-y-md text-sm">
        <fieldset className="space-y-xs" disabled={applying}>
          <legend className="mb-xs font-medium">{t('admin.pages.bulk.scopeLabel')}</legend>
          <label className="flex cursor-pointer items-center gap-sm">
            <input
              type="radio"
              name="bulk-visibility-scope"
              checked={scopeKind === 'pages'}
              disabled={selectedPageIds.length === 0}
              onChange={() => setScopeKind('pages')}
            />
            {t('admin.pages.bulk.scopeSelected', { count: selectedPageIds.length })}
          </label>
          <label className="flex cursor-pointer items-center gap-sm">
            <input
              type="radio"
              name="bulk-visibility-scope"
              checked={scopeKind === 'folder'}
              onChange={() => setScopeKind('folder')}
            />
            {folder
              ? t('admin.pages.bulk.scopeFolder', { space: spaceLabel, folder })
              : t('admin.pages.bulk.scopeSpace', { space: spaceLabel })}
          </label>
        </fieldset>

        <label className="block space-y-xs">
          <span className="font-medium">{t('admin.pages.bulk.visibilityLabel')}</span>
          <Select
            value={visibility}
            disabled={applying}
            aria-label={t('admin.pages.bulk.visibilityLabel')}
            onChange={(event) => {
              setApplyError(null);
              setVisibility(event.target.value as PageVisibility | '');
            }}
          >
            <option value="" disabled>{t('admin.pages.bulk.visibilityPlaceholder')}</option>
            {VISIBILITIES.map((option) => (
              <option key={option} value={option}>{t(`admin.pages.visibility.${option}`)}</option>
            ))}
          </Select>
        </label>

        {visibility && !current && <p className="text-muted">{t('admin.pages.bulk.counting')}</p>}

        {preview && (
          <div className="space-y-xs" aria-live="polite">
            <p>{t('admin.pages.bulk.summary', { matched: preview.matched, count: pending })}</p>
            {scopeKind === 'pages' && preview.matched < selectedPageIds.length && (
              <p className="text-muted">
                {t('admin.pages.bulk.missing', { count: selectedPageIds.length - preview.matched })}
              </p>
            )}
            {pending > 0 && (
              <p className="text-muted">
                {t('admin.pages.bulk.breakdown', {
                  public: preview.pending.public,
                  registered: preview.pending.registered,
                  restricted: preview.pending.restricted,
                })}
              </p>
            )}
          </div>
        )}

        {preview && visibility === 'public' && pending > 0 && (
          <div
            className="space-y-xs rounded-md border p-sm"
            style={{
              borderColor: 'color-mix(in srgb, var(--color-warning) 60%, transparent)',
              backgroundColor: 'color-mix(in srgb, var(--color-warning) 12%, transparent)',
            }}
            role="alert"
          >
            <p className="font-medium">{t('admin.pages.bulk.publicWarning', { count: pending })}</p>
            {preview.pending.restricted > 0 && (
              <p>{t('admin.pages.bulk.publicWarningRestricted', { count: preview.pending.restricted })}</p>
            )}
            {preview.pending.unpublished > 0 && (
              <p>{t('admin.pages.bulk.publicWarningUnpublished', { count: preview.pending.unpublished })}</p>
            )}
          </div>
        )}

        {applying && <p aria-live="polite">{t('admin.pages.bulk.progress', { changed: progress ?? 0, total: pending })}</p>}
        {error && <p className="text-danger" role="alert">{error}</p>}

        <div className="flex justify-end gap-sm">
          <Button variant="ghost" onClick={onClose} disabled={applying}>
            {t('common.actions.cancel')}
          </Button>
          <Button onClick={() => void apply()} disabled={!preview || pending === 0 || applying}>
            {pending > 0 ? t('admin.pages.bulk.apply', { count: pending }) : t('admin.pages.bulk.applyIdle')}
          </Button>
        </div>
      </div>
    </ModalDialog>
  );
}
