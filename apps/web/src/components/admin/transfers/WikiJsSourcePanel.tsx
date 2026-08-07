'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { TransferRunAccepted, TransferRunView, TransferSourceView } from '@next-wiki/shared';
import { useTranslation } from '@/i18n/client';
import type { TranslateFunction } from '@/i18n';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Tooltip } from '@/components/ui/Tooltip';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { ModalDialog } from '@/components/ui/ModalDialog';
import { LinkIcon, InfoIcon, PlusIcon, TrashIcon } from '@/components/icons';
import { apiDelete, apiPatch, apiPost } from '@/lib/api/client';
import { TransferRunList } from './TransferRunList';

const TERMINAL: TransferRunView['status'][] = ['completed', 'completed_with_warnings', 'failed', 'cancelled'];

function statusTone(status: TransferRunView['status']) {
  if (status === 'completed') return 'success' as const;
  if (status === 'completed_with_warnings') return 'warning' as const;
  if (status === 'failed' || status === 'cancelled') return 'danger' as const;
  return 'info' as const;
}

type StepTone = 'neutral' | 'active' | 'done' | 'error';

/** Latest attempt of a given kind, most recent first; undefined if none exist yet. */
function latestRunOf(runs: TransferRunView[], sourceId: string, kind: TransferRunView['kind']): TransferRunView | undefined {
  return runs
    .filter((run) => run.sourceId === sourceId && run.kind === kind)
    .sort((a, b) => new Date(b.queuedAt).getTime() - new Date(a.queuedAt).getTime())[0];
}

function stepToneForRun(run: TransferRunView | undefined): StepTone {
  if (!run) return 'neutral';
  if (!TERMINAL.includes(run.status)) return 'active';
  if (run.status === 'failed' || run.status === 'cancelled') return 'error';
  return 'done';
}

function StepBadge({ n, tone }: { n: number; tone: StepTone }) {
  const toneClass = {
    neutral: 'border-border bg-surface text-muted',
    active: 'border-primary bg-primary/10 text-primary',
    done: 'border-success/40 bg-success/15 text-success',
    error: 'border-danger/30 bg-danger-subtle text-danger',
  }[tone];
  return (
    <span
      className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold ${toneClass}`}
      aria-hidden="true"
    >
      {tone === 'done' ? '✓' : n}
    </span>
  );
}

function StepConnector() {
  return <div className="ml-3 h-4 w-px bg-border" aria-hidden="true" />;
}

function formatTime(value: string | null | undefined): string {
  return value ? new Date(value).toLocaleString() : '';
}

type WikiJsRunOptions = { includeHistory: boolean; historyLimit: number; conflictStrategy: 'skip' | 'replace' };

function historyOptionsStorageKey(sourceId: string): string {
  return `next-wiki:wikijs-import-options:${sourceId}`;
}

function isWikiJsRunOptions(value: unknown): value is WikiJsRunOptions {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.includeHistory === 'boolean' &&
    typeof candidate.historyLimit === 'number' &&
    (candidate.conflictStrategy === 'skip' || candidate.conflictStrategy === 'replace')
  );
}

/** Inline status line for a run: badge + timestamp + (for terminal runs) a
 * link to the full run detail page, so the user never has to guess whether
 * — or when — a preview/import actually happened. */
function RunStatusLine({ run, t }: { run: TransferRunView; t: TranslateFunction }) {
  const time = formatTime(run.finishedAt ?? run.queuedAt);
  const badge = <StatusBadge tone={statusTone(run.status)}>{t(`admin.transfers.status.${run.status}`)}</StatusBadge>;
  if (!TERMINAL.includes(run.status)) {
    return <div className="flex items-center gap-xs">{badge}</div>;
  }
  return (
    <Link href={`/admin/transfers/${run.id}`} className="flex flex-wrap items-center gap-xs hover:underline">
      {badge}
      <span className="text-muted">{time}</span>
      {run.status === 'failed' && run.errorMessage && <span className="text-danger">{run.errorMessage}</span>}
      {(run.status === 'completed' || run.status === 'completed_with_warnings') && (
        <span className="text-muted">
          {t('admin.transfers.wikijs.previewCounts', {
            created: run.createdItems,
            replaced: run.replacedItems,
            skipped: run.skippedItems,
          })}
        </span>
      )}
    </Link>
  );
}

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
  const defaultRunOptions: WikiJsRunOptions = { includeHistory: false, historyLimit: 300, conflictStrategy: 'skip' };
  // Step 1's options live only in this component's state and would otherwise
  // reset to defaults on every page refresh; restore them from localStorage
  // on init so a refresh doesn't lose what the user configured.
  const [historyOptions, setHistoryOptions] = useState<Record<string, WikiJsRunOptions>>(() => {
    if (typeof window === 'undefined') return {};
    const restored: Record<string, WikiJsRunOptions> = {};
    for (const source of sources) {
      const raw = window.localStorage.getItem(historyOptionsStorageKey(source.id));
      if (!raw) continue;
      try {
        const parsed = JSON.parse(raw);
        if (isWikiJsRunOptions(parsed)) restored[source.id] = parsed;
      } catch {
        // ignore malformed storage
      }
    }
    return restored;
  });

  function historyOptionsFor(sourceId: string) {
    return historyOptions[sourceId] ?? defaultRunOptions;
  }
  function setHistoryOptionsFor(sourceId: string, patch: Partial<WikiJsRunOptions>) {
    // Compute from the current render's state (not the updater's `prev`) so the
    // localStorage write stays outside the updater — React may invoke a
    // functional updater more than once, and it must stay a pure merge.
    const next = { ...historyOptionsFor(sourceId), ...patch };
    window.localStorage.setItem(historyOptionsStorageKey(sourceId), JSON.stringify(next));
    setHistoryOptions((prev) => ({ ...prev, [sourceId]: next }));
  }

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
      const { includeHistory, historyLimit, conflictStrategy } = historyOptionsFor(sourceId);
      await apiPost<Record<string, unknown>, TransferRunAccepted>('/api/transfers',
        kind === 'wikijs_preview'
          ? { kind, sourceId, options: { conflictStrategy, includeHistory, historyLimit } }
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
            <div className="flex items-center gap-sm text-sm">
              <label className="flex items-center gap-sm">
                <input type="checkbox" checked={privateNetwork} onChange={(event) => setPrivateNetwork(event.target.checked)} />
                {t('admin.transfers.wikijs.privateNetwork')}
              </label>
              {/* Kept outside the <label> — nesting it there made clicking
                  the icon also toggle the checkbox via label activation. */}
              <Tooltip label={t('admin.transfers.wikijs.privateNetworkHelp')}>
                <span className="inline-flex text-muted" tabIndex={0} role="img" aria-label={t('admin.transfers.wikijs.privateNetworkHelp')}>
                  <InfoIcon className="h-4 w-4" />
                </span>
              </Tooltip>
            </div>
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
        const { includeHistory, historyLimit, conflictStrategy } = historyOptionsFor(source.id);
        const latestPreview = latestRunOf(runs, source.id, 'wikijs_preview');
        const importablePreview = latestPreview && (latestPreview.status === 'completed' || latestPreview.status === 'completed_with_warnings')
          ? latestPreview
          : runs
              .filter((run) => run.sourceId === source.id && run.kind === 'wikijs_preview' && (run.status === 'completed' || run.status === 'completed_with_warnings'))
              .sort((a, b) => new Date(b.queuedAt).getTime() - new Date(a.queuedAt).getTime())[0];
        const previewInFlight = Boolean(latestPreview && !TERMINAL.includes(latestPreview.status));
        const usingOlderPreview = Boolean(
          importablePreview && latestPreview && latestPreview.id !== importablePreview.id && TERMINAL.includes(latestPreview.status),
        );
        const latestImport = latestRunOf(runs, source.id, 'wikijs_import');
        const importInFlight = Boolean(latestImport && !TERMINAL.includes(latestImport.status));

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
                <Tooltip label={t('admin.transfers.wikijs.delete')}>
                  <Button size="icon" variant="ghost" aria-label={t('admin.transfers.wikijs.delete')} disabled={busy} onClick={async () => { await apiDelete(`/api/transfer-sources/${source.id}`); window.localStorage.removeItem(historyOptionsStorageKey(source.id)); router.refresh(); }}>
                    <TrashIcon className="h-4 w-4" />
                  </Button>
                </Tooltip>
              </div>
            </div>

            <div className="mt-md border-t border-border pt-md">
              {/* Step 1 — configure. No lifecycle of its own; it just holds
                  the settings the next two steps act on. */}
              <div className="flex gap-sm">
                <StepBadge n={1} tone="neutral" />
                <div className="min-w-0 flex-1 pb-md">
                  <p className="text-sm font-semibold">{t('admin.transfers.wikijs.stepConfigure')}</p>
                  <div className="mt-xs flex flex-wrap items-center gap-sm text-sm">
                    <div className="flex items-center gap-xs">
                      <label className="flex items-center gap-xs">
                        <input
                          type="checkbox"
                          checked={includeHistory}
                          disabled={busy}
                          onChange={(event) => {
                            const checked = event.target.checked;
                            // Re-importing history only does something for pages
                            // that already exist, so default the conflict strategy
                            // to 'replace' when the box is checked — otherwise the
                            // hardcoded/default 'skip' silently no-ops the whole
                            // feature for every previously-imported page. Users can
                            // still override this via the selector below.
                            setHistoryOptionsFor(source.id, {
                              includeHistory: checked,
                              conflictStrategy: checked ? 'replace' : 'skip',
                            });
                          }}
                        />
                        {t('admin.transfers.wikijs.includeHistory')}
                      </label>
                      {/* Kept outside the <label> — nesting it there made clicking
                          the icon also toggle the checkbox via label activation. */}
                      <Tooltip label={t('admin.transfers.wikijs.includeHistoryHelp')}>
                        <span className="inline-flex text-muted" tabIndex={0} role="img" aria-label={t('admin.transfers.wikijs.includeHistoryHelp')}>
                          <InfoIcon className="h-4 w-4" />
                        </span>
                      </Tooltip>
                    </div>
                    <label className="flex items-center gap-xs whitespace-nowrap text-muted">
                      {t('admin.transfers.wikijs.existingPages')}
                      <Select
                        value={conflictStrategy}
                        disabled={busy}
                        className="w-auto"
                        onChange={(event) => setHistoryOptionsFor(source.id, { conflictStrategy: event.target.value as 'skip' | 'replace' })}
                      >
                        <option value="skip">{t('admin.transfers.conflict.skip')}</option>
                        <option value="replace">{t('admin.transfers.conflict.replace')}</option>
                      </Select>
                    </label>
                    {includeHistory && (
                      <label className="flex items-center gap-xs whitespace-nowrap text-muted">
                        {t('admin.transfers.wikijs.historyLimit')}
                        <Input
                          type="number"
                          min={1}
                          max={2000}
                          value={historyLimit}
                          disabled={busy}
                          className="w-20"
                          onChange={(event) => {
                            const parsed = Number(event.target.value);
                            if (Number.isFinite(parsed) && parsed > 0) setHistoryOptionsFor(source.id, { historyLimit: Math.min(2000, Math.floor(parsed)) });
                          }}
                        />
                      </label>
                    )}
                  </div>
                </div>
              </div>
              <StepConnector />

              {/* Step 2 — preview. Shows whether/when a preview has run, so
                  the user never has to guess before clicking Import. */}
              <div className="flex gap-sm">
                <StepBadge n={2} tone={stepToneForRun(latestPreview)} />
                <div className="min-w-0 flex-1 pb-md">
                  <div className="flex flex-wrap items-center gap-sm">
                    <p className="text-sm font-semibold">{t('admin.transfers.wikijs.stepPreview')}</p>
                    <Button
                      variant="secondary"
                      className="px-sm py-xs text-sm"
                      disabled={busy || previewInFlight}
                      onClick={() => start('wikijs_preview', source.id)}
                    >
                      {t('admin.transfers.wikijs.runPreview')}
                    </Button>
                  </div>
                  <div className="mt-xs text-sm">
                    {latestPreview ? (
                      <RunStatusLine run={latestPreview} t={t} />
                    ) : (
                      <p className="text-muted">{t('admin.transfers.wikijs.previewNotRun')}</p>
                    )}
                  </div>
                </div>
              </div>
              <StepConnector />

              {/* Step 3 — import. Gated on a completed preview so the guard
                  evaluated during preview always applies to what gets written. */}
              <div className="flex gap-sm">
                <StepBadge n={3} tone={stepToneForRun(latestImport)} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-sm">
                    <p className="text-sm font-semibold">{t('admin.transfers.wikijs.stepImport')}</p>
                    <Button
                      className="px-sm py-xs text-sm"
                      disabled={busy || !importablePreview || importInFlight}
                      onClick={() => importPreview(importablePreview!.id)}
                    >
                      {t('admin.transfers.wikijs.import')}
                    </Button>
                  </div>
                  <div className="mt-xs space-y-xs text-sm">
                    {!importablePreview && (
                      <p className="text-muted">{t('admin.transfers.wikijs.importDisabledHint')}</p>
                    )}
                    {usingOlderPreview && importablePreview && (
                      <p className="text-warning">
                        {t('admin.transfers.wikijs.usingOlderPreview', { time: formatTime(importablePreview.finishedAt ?? importablePreview.queuedAt) })}
                      </p>
                    )}
                    {latestImport && <RunStatusLine run={latestImport} t={t} />}
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })}
      <TransferRunList runs={runs} />
    </section>
  );
}
