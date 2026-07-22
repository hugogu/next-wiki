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
    <div className="space-y-xs rounded-md border border-border bg-background p-sm text-xs">
      <p className="font-medium">{t('ai.chat.tools.title')}</p>
      <ol className="space-y-xs">
        {calls.map((call) => (
          <li key={call.toolCallId} className="space-y-xxs">
            <div className="flex items-center justify-between gap-sm">
              <span className="font-medium">{call.toolName}</span>
              <span className="text-muted">{t(`ai.chat.tools.status.${call.status}` as TranslationKey)}</span>
            </div>
            <pre className="max-h-28 overflow-auto rounded bg-surface-elevated p-xs text-[11px] leading-snug">
              <code>{call.commandMarkdown}</code>
            </pre>
            {call.resultSummary && <p className="text-muted">{call.resultSummary}</p>}
            {call.errorMessage && <p className="text-danger">{call.errorMessage}</p>}
          </li>
        ))}
      </ol>
      {proposals.map((proposal) => (
        <div key={proposal.proposalId} className="flex items-center justify-between gap-sm border-t border-border pt-xs">
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
