'use client';

import type { AiToolCallEventPayload, AiToolProposalEventPayload } from '@next-wiki/shared';
import { useTranslation } from '@/i18n/client';
import type { TranslationKey } from '@/i18n/keys';

export function ToolCallTimeline({
  calls = [],
  proposals = [],
}: {
  calls?: AiToolCallEventPayload[];
  proposals?: AiToolProposalEventPayload[];
}) {
  const { t } = useTranslation();
  if (calls.length === 0 && proposals.length === 0) return null;

  return (
    <div className="min-w-0 max-w-full space-y-xxs overflow-hidden text-xs">
      <p className="sr-only">{t('ai.chat.tools.title')}</p>
      <ol className="space-y-xxs">
        {calls.map((call) => (
          <li key={call.toolCallId} className="min-w-0">
            <details className="group min-w-0 max-w-full overflow-hidden rounded-md border border-border bg-background">
              <summary className="flex min-h-8 min-w-0 cursor-pointer list-none items-center gap-xs px-sm py-xs marker:hidden">
                <span className="text-muted transition-transform group-open:rotate-90">&gt;</span>
                <span className="shrink-0 font-medium">{call.toolName}</span>
                <span className="text-muted">{t(`ai.chat.tools.status.${call.status}` as TranslationKey)}</span>
                {call.resultSummary && (
                  <span className="min-w-0 flex-1 truncate text-muted">{call.resultSummary}</span>
                )}
                {call.errorMessage && (
                  <span className="min-w-0 flex-1 truncate text-danger">{call.errorMessage}</span>
                )}
              </summary>
              <div className="min-w-0 space-y-xxs border-t border-border p-xs">
                {call.commandMarkdown && (
                  <pre className="max-h-28 max-w-full overflow-auto rounded bg-surface-elevated p-xs text-[11px] leading-snug">
                    <code>{call.commandMarkdown}</code>
                  </pre>
                )}
                {call.resultSummary && <p className="break-words text-muted">{call.resultSummary}</p>}
                {call.errorMessage && <p className="break-words text-danger">{call.errorMessage}</p>}
              </div>
            </details>
          </li>
        ))}
      </ol>
      {proposals.map((proposal) => (
        <div key={proposal.proposalId} className="flex min-w-0 items-center justify-between gap-sm border-t border-border pt-xs">
          <span className="truncate">{t('ai.chat.tools.proposalCreated')}: {proposal.title}</span>
          <a
            href={proposal.url}
            className="shrink-0 rounded-md border border-border bg-surface px-sm py-xs font-medium text-foreground hover:bg-surface-elevated"
          >
            {t('ai.chat.tools.reviewProposal')}
          </a>
        </div>
      ))}
    </div>
  );
}
