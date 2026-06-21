'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { TransferRunAccepted, TransferRunView, TransferSourceView } from '@next-wiki/shared';
import { useTranslation } from '@/i18n/client';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Tooltip } from '@/components/ui/Tooltip';
import { EyeIcon, LinkIcon, LogInIcon, TrashIcon } from '@/components/icons';
import { apiDelete, apiPost } from '@/lib/api/client';
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
      router.refresh();
    } catch (cause) {
      setError((cause as { message?: string }).message ?? 'Failed');
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
      <div className="rounded-lg border border-border bg-surface-elevated p-md">
        <h2 className="font-display text-lg font-semibold">{t('admin.transfers.tabs.wikijs')}</h2>
        <p className="mt-xs text-sm text-muted">{t('admin.transfers.wikijs.comingSoon')}</p>
        <div className="mt-md grid gap-sm">
          <Input value={name} onChange={(event) => setName(event.target.value)} placeholder={t('admin.transfers.wikijs.name')} />
          <Input value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} placeholder="https://wiki.example.com" />
          <Input type="password" value={apiToken} onChange={(event) => setApiToken(event.target.value)} placeholder={t('admin.transfers.wikijs.token')} />
          <label className="flex items-center gap-sm text-sm">
            <input type="checkbox" checked={privateNetwork} onChange={(event) => setPrivateNetwork(event.target.checked)} />
            {t('admin.transfers.wikijs.privateNetwork')}
          </label>
          <div><Button disabled={busy || !name || !baseUrl || !apiToken} onClick={createSource}>{t('admin.transfers.wikijs.add')}</Button></div>
        </div>
        {error && <p className="mt-sm text-sm text-danger">{error}</p>}
      </div>
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
                      <LogInIcon className="h-4 w-4" />
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
