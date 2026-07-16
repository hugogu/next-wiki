'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { TransferRunAccepted, TransferRunView, TransferSourceView } from '@next-wiki/shared';
import { useTranslation } from '@/i18n/client';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Tooltip } from '@/components/ui/Tooltip';
import { ModalDialog } from '@/components/ui/ModalDialog';
import { EyeIcon, LinkIcon, ImportIcon, InfoIcon, PlusIcon, TrashIcon } from '@/components/icons';
import { apiDelete, apiPatch, apiPost } from '@/lib/api/client';
import { TransferRunList } from './TransferRunList';

export function WikiJsSourcePanel({
  sources,
  runs,
}: {
  sources: TransferSourceView[];
  runs: TransferRunView[];
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const [name, setName] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [apiToken, setApiToken] = useState('');
  const [privateNetwork, setPrivateNetwork] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  const [testStatus, setTestStatus] = useState<'idle' | 'running' | 'success' | 'error'>('idle');
  const [testMessage, setTestMessage] = useState<string | null>(null);

  async function createSource() {
    setBusy(true);
    setError(null);
    try {
      await apiPost('/api/transfer-sources', {
        type: 'wikijs',
        name,
        baseUrl,
        apiToken,
        allowPrivateNetwork: privateNetwork,
        enabled: true,
      });
      setName('');
      setBaseUrl('');
      setApiToken('');
      setPrivateNetwork(false);
      setTestStatus('idle');
      setTestMessage(null);
      setShowAdd(false);
      router.refresh();
    } catch (cause) {
      setError((cause as { message?: string }).message ?? 'Failed');
    } finally {
      setBusy(false);
    }
  }

  async function testSource() {
    setBusy(true);
    setError(null);
    setTestStatus('running');
    setTestMessage(null);
    try {
      const result = await apiPatch<Record<string, unknown>, { ok: boolean; pageCount?: number; errorMessage?: string }>(
        '/api/transfer-sources',
        { baseUrl, apiToken, allowPrivateNetwork: privateNetwork },
      );
      if (result.ok) {
        setTestStatus('success');
        setTestMessage(`${t('admin.transfers.wikijs.testSuccess')}: ${result.pageCount ?? 0} pages`);
      } else {
        setTestStatus('error');
        setTestMessage(result.errorMessage ?? t('admin.transfers.wikijs.testFailed'));
      }
    } catch (cause) {
      setTestStatus('error');
      setTestMessage((cause as { message?: string }).message ?? t('admin.transfers.wikijs.testFailed'));
    } finally {
      setBusy(false);
    }
  }

  async function start(kind: 'wikijs_source_test' | 'wikijs_preview', sourceId: string) {
    setBusy(true);
    try {
      await apiPost<Record<string, unknown>, TransferRunAccepted>('/api/transfers',
        kind === 'wikijs_preview'
          ? { kind, sourceId, options: { conflictStrategy: 'skip' } }
          : { kind, sourceId });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function importPreview(previewRunId: string) {
    setBusy(true);
    try {
      await apiPost('/api/transfers', { kind: 'wikijs_import', previewRunId });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-md">
      <div className="flex flex-wrap items-start justify-between gap-sm rounded-lg border border-border bg-surface-elevated p-md">
        <div>
          <h2 className="font-display text-lg font-semibold">{t('admin.transfers.tabs.wikijs')}</h2>
          <p className="mt-xs text-sm text-muted">{t('admin.transfers.wikijs.comingSoon')}</p>
        </div>
        <Button onClick={() => { setError(null); setTestStatus('idle'); setTestMessage(null); setShowAdd(true); }}>
          <PlusIcon className="h-4 w-4" />
          <span className="ml-xs">{t('admin.transfers.wikijs.add')}</span>
        </Button>
      </div>

      {showAdd && (
        <ModalDialog
          title={t('admin.transfers.wikijs.addTitle')}
          description={t('admin.transfers.wikijs.comingSoon')}
          onClose={() => { if (!busy) setShowAdd(false); }}
          maxWidth="max-w-lg"
        >
          <div className="grid gap-sm">
            <Input value={name} onChange={(event) => setName(event.target.value)} placeholder={t('admin.transfers.wikijs.name')} />
            <Input value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} placeholder="https://wiki.example.com" />
            <Input type="password" value={apiToken} onChange={(event) => setApiToken(event.target.value)} placeholder={t('admin.transfers.wikijs.token')} />
            <label className="flex items-center gap-sm text-sm">
              <input type="checkbox" checked={privateNetwork} onChange={(event) => setPrivateNetwork(event.target.checked)} />
              {t('admin.transfers.wikijs.privateNetwork')}
              <Tooltip label={t('admin.transfers.wikijs.privateNetworkHelp')}>
                <span className="inline-flex text-muted" tabIndex={0} role="img" aria-label={t('admin.transfers.wikijs.privateNetworkHelp')}>
                  <InfoIcon className="h-4 w-4" />
                </span>
              </Tooltip>
            </label>
            <div className="mt-sm flex flex-wrap items-center gap-sm">
              <Button
                disabled={busy || !baseUrl || !apiToken}
                variant="secondary"
                onClick={testSource}
              >
                {t('admin.transfers.wikijs.test')}
              </Button>
              <Button disabled={busy || !name || !baseUrl || !apiToken} onClick={createSource}>{t('admin.transfers.wikijs.add')}</Button>
            </div>
            {testStatus !== 'idle' && (
              <p
                className={`text-sm ${
                  testStatus === 'success' ? 'text-success' : testStatus === 'error' ? 'text-danger' : 'text-muted'
                }`}
              >
                {testStatus === 'running' ? t('admin.transfers.wikijs.testing') : testMessage}
              </p>
            )}
            {error && <p className="text-sm text-danger">{error}</p>}
          </div>
        </ModalDialog>
      )}

      {sources.map((source) => {
        const preview = runs.find((run) => run.sourceId === source.id && run.kind === 'wikijs_preview' && (run.status === 'completed' || run.status === 'completed_with_warnings'));
        return (
          <div key={source.id} className="rounded-lg border border-border p-md">
            <div className="flex flex-wrap items-center justify-between gap-sm">
              <div><p className="font-medium">{source.name}</p><p className="text-xs text-muted">{source.baseUrl}</p></div>
              <div className="flex items-center gap-xs">
                <Tooltip label={t('admin.transfers.wikijs.test')}>
                  <Button size="icon" variant="ghost" aria-label={t('admin.transfers.wikijs.test')} disabled={busy} onClick={() => start('wikijs_source_test', source.id)}>
                    <LinkIcon className="h-4 w-4" />
                  </Button>
                </Tooltip>
                <Tooltip label={t('admin.transfers.wikijs.preview')}>
                  <Button size="icon" variant="ghost" aria-label={t('admin.transfers.wikijs.preview')} disabled={busy} onClick={() => start('wikijs_preview', source.id)}>
                    <EyeIcon className="h-4 w-4" />
                  </Button>
                </Tooltip>
                {preview && (
                  <Tooltip label={t('admin.transfers.wikijs.import')}>
                    <Button size="icon" variant="ghost" aria-label={t('admin.transfers.wikijs.import')} disabled={busy} onClick={() => importPreview(preview.id)}>
                      <ImportIcon className="h-4 w-4" />
                    </Button>
                  </Tooltip>
                )}
                <Tooltip label={t('admin.transfers.wikijs.delete')}>
                  <Button size="icon" variant="ghost" aria-label={t('admin.transfers.wikijs.delete')} disabled={busy} onClick={async () => { await apiDelete(`/api/transfer-sources/${source.id}`); router.refresh(); }}>
                    <TrashIcon className="h-4 w-4" />
                  </Button>
                </Tooltip>
              </div>
            </div>
          </div>
        );
      })}
      <TransferRunList runs={runs} />
    </section>
  );
}
