'use client';

import { useCallback, useState } from 'react';
import Link from 'next/link';
import type { AiToolProposalDetail as ProposalDetail, AiToolProposalStatus } from '@next-wiki/shared';
import { Button } from '@/components/ui/Button';
import { useTranslation } from '@/i18n/client';
import type { TranslationKey } from '@/i18n/keys';

function statusKey(status: AiToolProposalStatus): TranslationKey {
  return `admin.ai.tools.proposals.status.${status}` as TranslationKey;
}
function kindKey(kind: ProposalDetail['kind']): TranslationKey {
  return `admin.ai.tools.proposals.kind.${kind}` as TranslationKey;
}
function itemStatusKey(status: ProposalDetail['items'][number]['applyStatus']): TranslationKey {
  return `admin.ai.tools.proposals.itemStatus.${status}` as TranslationKey;
}

export function ToolProposalDetail({ initial }: { initial: ProposalDetail }) {
  const { t } = useTranslation();
  const [detail, setDetail] = useState<ProposalDetail>(initial);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  const act = useCallback(
    async (action: 'approve' | 'reject' | 'apply') => {
      setBusy(true);
      setMessage(null);
      try {
        const response = await fetch(`/api/ai/tool-proposals/${detail.id}/${action}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({}),
        });
        if (!response.ok) throw new Error('request failed');
        if (action === 'apply') {
          // Apply returns per-item results; refetch the detail for updated state.
          const refreshed = await fetch(`/api/ai/tool-proposals/${detail.id}`);
          if (refreshed.ok) setDetail((await refreshed.json()) as ProposalDetail);
          setMessage({ kind: 'ok', text: t('admin.ai.tools.proposals.applied') });
        } else {
          setDetail((await response.json()) as ProposalDetail);
          setMessage({
            kind: 'ok',
            text: t(action === 'approve' ? 'admin.ai.tools.proposals.approved' : 'admin.ai.tools.proposals.rejected'),
          });
        }
      } catch {
        setMessage({ kind: 'error', text: t('admin.ai.tools.proposals.decisionError') });
      } finally {
        setBusy(false);
      }
    },
    [detail.id, t],
  );

  const canApprove = detail.status === 'pending' || detail.status === 'failed';
  const canReject = detail.status === 'pending' || detail.status === 'approved' || detail.status === 'failed';
  const canApply = detail.status === 'approved';

  return (
    <div className="space-y-md">
      <div>
        <Link href="/admin/ai/tools" className="text-sm text-muted hover:text-foreground">
          ← {t('admin.ai.tools.proposals.back')}
        </Link>
      </div>

      <header className="space-y-xs">
        <div className="flex flex-wrap items-center gap-sm">
          <h1 className="font-display text-xl font-semibold">{detail.title}</h1>
          <span className="rounded-full bg-surface-elevated px-sm py-0.5 text-xs">{t(kindKey(detail.kind))}</span>
          <span className="rounded-full bg-surface-elevated px-sm py-0.5 text-xs">{t(statusKey(detail.status))}</span>
          {detail.hasConflict ? (
            <span className="rounded-full bg-danger/10 px-sm py-0.5 text-xs text-danger">
              {t('admin.ai.tools.proposals.conflict')}
            </span>
          ) : null}
        </div>
        <dl className="grid grid-cols-2 gap-x-lg gap-y-xs text-sm sm:grid-cols-3">
          <div>
            <dt className="text-xs text-muted">{t('admin.ai.tools.proposals.requestedReview')}</dt>
            <dd>{t(`admin.ai.tools.effectiveReview.${detail.requestedReview}` as TranslationKey)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">{t('admin.ai.tools.proposals.effectiveReview')}</dt>
            <dd>{t(`admin.ai.tools.effectiveReview.${detail.effectiveReview}` as TranslationKey)}</dd>
          </div>
          {detail.sourceToolName ? (
            <div>
              <dt className="text-xs text-muted">{t('admin.ai.tools.proposals.sourceTool')}</dt>
              <dd className="font-mono text-xs">{detail.sourceToolName}</dd>
            </div>
          ) : null}
        </dl>
      </header>

      {detail.rationale ? (
        <section>
          <h2 className="text-xs font-medium text-muted">{t('admin.ai.tools.proposals.rationale')}</h2>
          <p className="text-sm">{detail.rationale}</p>
        </section>
      ) : null}

      <section className="space-y-sm">
        <h2 className="text-sm font-semibold">{t('admin.ai.tools.proposals.items')}</h2>
        {detail.items.length === 0 ? (
          <p className="text-sm text-muted">{t('admin.ai.tools.proposals.empty')}</p>
        ) : (
          <ul className="space-y-sm">
            {detail.items.map((item) => (
              <li key={item.id} className="rounded-md border border-border p-sm">
                <div className="flex flex-wrap items-center gap-sm text-sm">
                  <span className="font-mono text-xs">{item.resourceKind}</span>
                  {item.resourceLabel ? <span className="font-medium">{item.resourceLabel}</span> : null}
                  <span className="ml-auto rounded-full bg-surface-elevated px-sm text-xs">
                    {t(itemStatusKey(item.applyStatus))}
                  </span>
                  {item.hasConflict ? (
                    <span className="rounded-full bg-danger/10 px-sm text-xs text-danger">
                      {t('admin.ai.tools.proposals.conflict')}
                    </span>
                  ) : null}
                </div>
                <div className="mt-xs grid gap-sm sm:grid-cols-2">
                  <div>
                    <div className="text-xs text-muted">{t('admin.ai.tools.proposals.before')}</div>
                    <pre className="overflow-x-auto rounded bg-surface-elevated p-xs text-xs">
                      {JSON.stringify(item.beforeState, null, 2)}
                    </pre>
                  </div>
                  <div>
                    <div className="text-xs text-muted">{t('admin.ai.tools.proposals.after')}</div>
                    <pre className="overflow-x-auto rounded bg-surface-elevated p-xs text-xs">
                      {JSON.stringify(item.afterState, null, 2)}
                    </pre>
                  </div>
                </div>
                {item.errorMessage ? <p className="mt-xs text-xs text-danger">{item.errorMessage}</p> : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      {detail.evidenceLinks.length > 0 ? (
        <section className="space-y-xs">
          <h2 className="text-sm font-semibold">{t('admin.ai.tools.proposals.evidence')}</h2>
          <ul className="space-y-xs text-sm">
            {detail.evidenceLinks.map((link) => (
              <li key={link.id}>
                {link.evidenceUrl ? (
                  <Link href={link.evidenceUrl} className="text-primary hover:underline">
                    {link.targetKind}
                  </Link>
                ) : (
                  <span className="text-muted">{t('admin.ai.tools.proposals.evidenceRedacted')}</span>
                )}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {message ? (
        <p role="status" className={`text-sm ${message.kind === 'error' ? 'text-danger' : 'text-muted'}`}>
          {message.text}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-sm">
        {canApprove ? (
          <Button type="button" variant="primary" disabled={busy} onClick={() => act('approve')}>
            {t('admin.ai.tools.proposals.approve')}
          </Button>
        ) : null}
        {canApply ? (
          <Button type="button" variant="primary" disabled={busy} onClick={() => act('apply')}>
            {t('admin.ai.tools.proposals.apply')}
          </Button>
        ) : null}
        {canReject ? (
          <Button type="button" variant="danger" disabled={busy} onClick={() => act('reject')}>
            {t('admin.ai.tools.proposals.reject')}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
