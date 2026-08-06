'use client';

import { useEffect, useState } from 'react';
import type { SpaceMigrationOperation, SpaceMigrationPreview } from '@next-wiki/shared';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { ModalDialog } from '@/components/ui/ModalDialog';
import { Select } from '@/components/ui/Select';
import { apiGet, apiPost, type ApiError } from '@/lib/api/client';
import { useTranslation } from '@/i18n/client';

type Space = { id: string; kind: 'wiki' | 'raw' | 'generated'; routePrefix: string; isActive: boolean };
type Selection = { kind: 'page'; pageId: string } | { kind: 'folder'; sourceSpaceId: string; pathPrefix: string };

export function CrossSpaceMigrationDialog({
  selection,
  sourceSpaceKind,
  title,
  onClose,
  onComplete,
}: {
  selection: Selection;
  sourceSpaceKind?: 'wiki' | 'generated';
  title: string;
  onClose: () => void;
  onComplete?: (operation: SpaceMigrationOperation) => void;
}) {
  const { t } = useTranslation();
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [destinationId, setDestinationId] = useState('');
  const [destinationPathPrefix, setDestinationPathPrefix] = useState('');
  const [preview, setPreview] = useState<SpaceMigrationPreview | null>(null);
  const [operation, setOperation] = useState<SpaceMigrationOperation | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void apiGet<{ spaces: Space[] }>('/api/settings/spaces').then((result) => {
      const eligible = result.spaces.filter((space) => space.isActive && space.kind !== 'raw' && space.kind !== sourceSpaceKind);
      // Keep the source space too: Navigator folder nodes are virtual paths,
      // so their source UUID is resolved here after the settings request.
      setSpaces(result.spaces);
      setDestinationId(eligible[0]?.id ?? '');
    }).catch((err: ApiError) => setError(err.message));
  }, [sourceSpaceKind]);

  useEffect(() => {
    if (!operation || ['completed', 'completed_with_warnings', 'failed', 'cancelled'].includes(operation.status)) return;
    const timer = window.setInterval(() => {
      void apiGet<SpaceMigrationOperation>(`/api/v1/space-migrations/${operation.id}`).then((next) => {
        setOperation(next);
        if (['completed', 'completed_with_warnings', 'failed', 'cancelled'].includes(next.status)) onComplete?.(next);
      }).catch((err: ApiError) => setError(err.message));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [onComplete, operation]);

  const previewMigration = async () => {
    if (!destinationId) return;
    setPending(true); setError(null);
    try {
      const actualSelection = selection.kind === 'folder' && !selection.sourceSpaceId
        ? { ...selection, sourceSpaceId: spaces.find((space) => space.kind === sourceSpaceKind)?.id ?? '' }
        : selection;
      setPreview(await apiPost<{ selection: Selection; destinationSpaceId: string; destinationPathPrefix?: string }, SpaceMigrationPreview>('/api/v1/space-migrations/previews', { selection: actualSelection, destinationSpaceId: destinationId, ...(destinationPathPrefix.trim() ? { destinationPathPrefix: destinationPathPrefix.trim() } : {}) }));
    } catch (err) { setError((err as ApiError).message); } finally { setPending(false); }
  };

  const confirm = async () => {
    if (!preview) return;
    setPending(true); setError(null);
    try { setOperation(await apiPost('/api/v1/space-migrations', { previewId: preview.id, fingerprint: preview.fingerprint })); }
    catch (err) { setError((err as ApiError).message); } finally { setPending(false); }
  };

  const cancel = async () => {
    if (!operation) return;
    setPending(true);
    try { setOperation(await apiPost(`/api/v1/space-migrations/${operation.id}/cancellation`, {})); }
    catch (err) { setError((err as ApiError).message); } finally { setPending(false); }
  };

  const terminal = operation && ['completed', 'completed_with_warnings', 'failed', 'cancelled'].includes(operation.status);
  return <ModalDialog title={t('admin.pages.move.title', { space: 'another space' })} description={t('admin.pages.move.description', { title, space: 'another space' })} onClose={() => { if (!pending) onClose(); }}>
    <div className="space-y-md" aria-live="polite">
      {!preview && !operation && <div className="grid gap-md sm:grid-cols-2">
        <label className="block min-w-0 space-y-xs text-sm font-medium">
          <span>{t('admin.pages.move.destinationLabel')}</span>
          <Select value={destinationId} onChange={(event) => { setDestinationId(event.target.value); setPreview(null); }} disabled={pending}>
            {spaces.filter((space) => space.isActive && space.kind !== 'raw' && space.kind !== sourceSpaceKind).map((space) => <option key={space.id} value={space.id}>{space.kind === 'wiki' ? t('admin.pages.spaces.wiki') : t('admin.pages.spaces.generated')}</option>)}
          </Select>
        </label>
        <label className="block min-w-0 space-y-xs text-sm font-medium">
          <span>{t('admin.pages.move.destinationPathLabel')}</span>
          <input value={destinationPathPrefix} onChange={(event) => setDestinationPathPrefix(event.target.value)} placeholder={t('admin.pages.move.destinationPathPlaceholder')} className="w-full rounded-md border border-border bg-surface px-md py-sm text-sm" />
        </label>
      </div>}
      {preview && !operation && <div className="rounded-md border border-border p-sm text-sm">
        <p>{t('admin.pages.move.previewCount', { count: preview.items.length })}</p>
        {preview.items.some((item) => item.warning) && <ul className="mt-xs list-disc pl-lg text-muted">{preview.items.filter((item) => item.warning).map((item) => <li key={item.pageId}>{item.destinationPath}: {item.warning}</li>)}</ul>}
      </div>}
      {operation && <div className="rounded-md border border-border p-sm text-sm">
        <p>{t('admin.pages.move.operationStatus', { status: operation.status, moved: operation.movedItems, total: operation.totalItems })}</p>
        {operation.failure && <p className="mt-xs text-danger">{operation.failure}</p>}
      </div>}
      {error && <Alert>{error}</Alert>}
      <div className="flex justify-end gap-sm">
        <Button variant="ghost" onClick={onClose} disabled={pending}>{t('common.actions.cancel')}</Button>
        {!preview && !operation && <Button onClick={previewMigration} disabled={pending || !destinationId}>{pending ? t('common.status.saving') : t('admin.pages.move.preview')}</Button>}
        {preview && !operation && <Button onClick={confirm} disabled={pending}>{pending ? t('common.status.saving') : t('admin.pages.move.confirm')}</Button>}
        {operation && !terminal && <Button variant="ghost" onClick={cancel} disabled={pending}>{t('admin.pages.move.cancelMigration')}</Button>}
      </div>
    </div>
  </ModalDialog>;
}
