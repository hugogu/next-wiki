'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { TransferArtifactView, TransferRunAccepted, TransferRunView } from '@next-wiki/shared';
import { useTranslation } from '@/i18n/client';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Tooltip } from '@/components/ui/Tooltip';
import { FolderIcon, InfoIcon } from '@/components/icons';
import { apiPost } from '@/lib/api/client';
import { TransferRunList } from './TransferRunList';

export function ArchiveImportPanel({ runs }: { runs: TransferRunView[] }) {
  const { t } = useTranslation();
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [strategy, setStrategy] = useState<'skip' | 'replace'>('skip');
  const [includeHistory, setIncludeHistory] = useState(false);
  const [historyLimit, setHistoryLimit] = useState(300);
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
        options: { conflictStrategy: 'skip' | 'replace'; includeHistory: boolean; historyLimit: number };
      }, TransferRunAccepted>('/api/transfers', {
        kind: 'archive_preview',
        sourceArtifactId: artifact.id,
        options: { conflictStrategy: strategy, includeHistory, historyLimit },
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
        <div className="mt-sm flex flex-wrap items-center gap-sm text-sm">
          <div className="flex items-center gap-xs">
            <label className="flex items-center gap-xs">
              <input
                type="checkbox"
                checked={includeHistory}
                disabled={busy}
                onChange={(event) => {
                  const checked = event.target.checked;
                  // Re-importing history only does something for pages that
                  // already exist, so default the conflict strategy to
                  // 'replace' when checked, matching WikiJsSourcePanel.
                  setIncludeHistory(checked);
                  setStrategy(checked ? 'replace' : 'skip');
                }}
              />
              {t('admin.transfers.archive.includeHistory')}
            </label>
            {/* Kept outside the <label> — nesting it there made clicking
                the icon also toggle the checkbox via label activation. */}
            <Tooltip label={t('admin.transfers.archive.includeHistoryHelp')}>
              <span className="inline-flex text-muted" tabIndex={0} role="img" aria-label={t('admin.transfers.archive.includeHistoryHelp')}>
                <InfoIcon className="h-4 w-4" />
              </span>
            </Tooltip>
          </div>
          {includeHistory && (
            <label className="flex items-center gap-xs whitespace-nowrap text-muted">
              {t('admin.transfers.archive.historyLimit')}
              <Input
                type="number"
                min={1}
                max={2000}
                value={historyLimit}
                disabled={busy}
                className="w-20"
                onChange={(event) => {
                  const parsed = Number(event.target.value);
                  if (Number.isFinite(parsed) && parsed > 0) setHistoryLimit(Math.min(2000, Math.floor(parsed)));
                }}
              />
            </label>
          )}
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
