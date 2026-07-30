'use client';

import type { AiToolCallEventPayload, AiToolProposalEventPayload } from '@next-wiki/shared';
import { useTranslation } from '@/i18n/client';
import type { TranslationKey } from '@/i18n/keys';

/** Skills the assistant actually consulted, in the order it reached for them.
 * Only successful loads count: a denied or failed one did not shape the answer,
 * so listing it would overstate what the assistant followed. */
function skillsConsulted(calls: AiToolCallEventPayload[]): string[] {
  const names: string[] = [];
  for (const call of calls) {
    if (call.status !== 'succeeded' || !call.skillName) continue;
    if (!names.includes(call.skillName)) names.push(call.skillName);
  }
  return names;
}

export function ToolCallTimeline({
  calls = [],
  proposals = [],
  embedded = false,
}: {
  calls?: AiToolCallEventPayload[];
  proposals?: AiToolProposalEventPayload[];
  embedded?: boolean;
}) {
  const { t } = useTranslation();
  if (calls.length === 0 && proposals.length === 0) return null;
  const skills = skillsConsulted(calls);

  return (
    <div className="min-w-0 max-w-full space-y-xxs overflow-hidden text-xs">
      <p className="sr-only">{t('ai.chat.tools.title')}</p>
      {skills.length > 0 && (
        // Above the call list so it survives the timeline being collapsed:
        // which procedure the assistant followed is the part a reader wants
        // without expanding anything.
        <p className="min-w-0 truncate px-sm py-xxs text-muted">
          {t('ai.chat.tools.skillsUsed')}: <span className="font-medium">{skills.join(', ')}</span>
        </p>
      )}
      <ol className={embedded ? '' : 'space-y-xxs'}>
        {calls.map((call) => (
          <li
            key={call.toolCallId}
            className={embedded ? 'min-w-0 border-t border-border first:border-t-0' : 'min-w-0'}
          >
            <details className={embedded
              ? 'group min-w-0 max-w-full overflow-hidden'
              : 'group min-w-0 max-w-full overflow-hidden rounded-md border border-border bg-background'}>
              <summary className="flex min-h-8 min-w-0 cursor-pointer list-none items-center gap-xs px-sm py-xs marker:hidden">
                <span className="text-muted transition-transform group-open:rotate-90">&gt;</span>
                {call.skillName ? (
                  // Named as the skill rather than the tool: `load_skill` means
                  // nothing to a reader, "Skill: wiki-linker" does.
                  <span className="shrink-0 font-medium">
                    {t('ai.chat.tools.skillLabel')}: {call.skillName}
                  </span>
                ) : (
                  <span className="shrink-0 font-medium">{call.toolName}</span>
                )}
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
                {call.errorDetail && (
                  <div className="space-y-xxs">
                    <p className="font-medium text-danger">{t('ai.chat.tools.rawError')}</p>
                    <pre className="max-h-40 max-w-full overflow-auto rounded bg-surface-elevated p-xs text-[11px] leading-snug text-danger">
                      <code>{call.errorDetail}</code>
                    </pre>
                  </div>
                )}
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
