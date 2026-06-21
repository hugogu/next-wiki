'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { TransferArtifactView, TransferRunAccepted, TransferRunView } from '@next-wiki/shared';
import { useTranslation } from '@/i18n/client';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { FolderIcon } from '@/components/icons';
import { apiPost } from '@/lib/api/client';
import { TransferRunList } from './TransferRunList';

export function ArchiveImportPanel({ runs }: { runs: TransferRunView[] }) {
  const { t } = useTranslation();
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [strategy, setStrategy] = useState<'skip' | 'replace'>('skip');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const completedPreview = runs.find(
    (run) =>
      run.kind === 'archive_preview' &&
      (run.status === 'completed' || run.status === 'completed_with_warnings'),
  );

  async function uploadAndPreview() {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const artifact = await apiPost<
        { kind: 'source_archive'; filename: string; sizeBytes: number },
        TransferArtifactView
      >('/api/transfer-artifacts', {
        kind: 'source_archive',
        filename: file.name,
        sizeBytes: file.size,
      });
      const uploaded = await fetch(`/api/transfer-artifacts/${artifact.id}/content`, {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': 'application/zip' },
      });
      if (!uploaded.ok) {
        const body = await uploaded.json().catch(() => ({ message: 'Upload failed' }));
        throw new Error(body.message);
      }
      await apiPost<{
        kind: 'archive_preview';
        sourceArtifactId: string;
        options: { conflictStrategy: 'skip' | 'replace' };
      }, TransferRunAccepted>('/api/transfers', {
        kind: 'archive_preview',
        sourceArtifactId: artifact.id,
        options: { conflictStrategy: strategy },
      });
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Upload failed');
    } finally {
      setBusy(false);
    }
  }

  async function confirmImport() {
    if (!completedPreview) return;
    setBusy(true);
    setError(null);
    try {
      await apiPost<{ kind: 'archive_import'; previewRunId: string }, TransferRunAccepted>(
        '/api/transfers',
        { kind: 'archive_import', previewRunId: completedPreview.id },
      );
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Import failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-md">
      <div className="rounded-lg border border-border bg-surface-elevated p-md">
        <h2 className="font-display text-lg font-semibold">{t('admin.transfers.tabs.archives')}</h2>
        <p className="mt-xs text-sm text-muted">{t('admin.transfers.archive.comingSoon')}</p>
        <div className="mt-md grid gap-sm sm:grid-cols-[1fr_auto_auto]">
          <label className="flex cursor-pointer items-center gap-sm rounded-md border border-border bg-surface px-md py-sm text-sm hover:bg-surface-elevated">
            <FolderIcon className="h-4 w-4 shrink-0 text-muted" />
            <span className={file ? 'truncate' : 'truncate text-muted'}>
              {file ? file.name : t('admin.transfers.archive.chooseFile')}
            </span>
            <input
              type="file"
              accept=".zip,application/zip"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              className="sr-only"
            />
          </label>
          <Select
            value={strategy}
            onChange={(event) => setStrategy(event.target.value as 'skip' | 'replace')}
          >
            <option value="skip">{t('admin.transfers.conflict.skip')}</option>
            <option value="replace">{t('admin.transfers.conflict.replace')}</option>
          </Select>
          <Button disabled={!file || busy} onClick={uploadAndPreview}>
            {t('admin.transfers.archive.preview')}
          </Button>
        </div>
        {completedPreview && (
          <div className="mt-md flex items-center justify-between gap-sm rounded-md border border-border p-sm">
            <span className="text-sm">{t('admin.transfers.archive.previewReady')}</span>
            <Button disabled={busy} onClick={confirmImport}>{t('admin.transfers.archive.import')}</Button>
          </div>
        )}
        {error && <p className="mt-sm text-sm text-danger">{error}</p>}
      </div>
      <TransferRunList runs={runs} />
    </section>
  );
}
