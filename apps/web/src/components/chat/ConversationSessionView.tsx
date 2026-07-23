'use client';

import type { ConversationSessionTurn, ConversationSessionViewModel } from '@next-wiki/shared';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useTranslation } from '@/i18n/client';
import type { TranslationKey } from '@/i18n/types';
import { ChatAnswer } from './ChatAnswer';
import { ChatCitations } from './ChatCitations';
import { ChatThinking } from './ChatThinking';

const STATUS_LABELS: Record<ConversationSessionViewModel['status'], TranslationKey> = {
  queued: 'admin.ai.actionStatus.queued',
  running: 'admin.ai.actionStatus.running',
  completed: 'admin.ai.actionStatus.completed',
  failed: 'admin.ai.actionStatus.failed',
  cancelled: 'admin.ai.actionStatus.cancelled',
  expired: 'admin.ai.actionStatus.expired',
};

const STATUS_TONE: Record<ConversationSessionViewModel['status'], 'neutral' | 'success' | 'warning' | 'danger' | 'info'> = {
  queued: 'neutral',
  running: 'info',
  completed: 'success',
  failed: 'danger',
  cancelled: 'neutral',
  expired: 'neutral',
};

/** The conversation lifecycle badge, factored out so a page-level header
 * (e.g. the Raw Conversation reader's breadcrumb) can place it inline with
 * other page chrome instead of stacking it above the question. */
export function ConversationStatusBadge({
  status,
  className,
}: {
  status: ConversationSessionViewModel['status'];
  className?: string;
}) {
  const { t } = useTranslation();
  return (
    <span className={className}>
      <StatusBadge tone={STATUS_TONE[status]}>{t(STATUS_LABELS[status])}</StatusBadge>
    </span>
  );
}

/**
 * Shared conversation detail body for a Wiki AI question/answer session —
 * reused by AI Chat History detail (legacy event-log reconstruction) and by
 * the Raw Conversation reader (captured page snapshot), so both surfaces
 * render identically. Deliberately has no header/action controls of its own;
 * callers keep session-level actions (continue, delete, close) in their own
 * header per the UI contract.
 *
 * `showStatus` defaults to true (the badge renders above the question, as in
 * AI Chat History's detail modal). A caller that already places the status
 * badge elsewhere (e.g. next to the Raw page breadcrumb) passes `false` and
 * renders `ConversationStatusBadge` there instead, so the status never
 * appears twice or consumes its own reading line.
 */
export function ConversationSessionView({
  conversation,
  showStatus = true,
  channel,
}: {
  conversation: ConversationSessionViewModel;
  showStatus?: boolean;
  /** 025: the bot channel this conversation was captured under, from
   * `RawConversationPointer.channel`. Renders a small "Feishu" badge near the
   * header when `'feishu'`; omitted entirely for `'wiki-ai'` or absent
   * (legacy captures and every web chat). Purely decorative metadata — the
   * rest of the reader is identical between channels. */
  channel?: 'wiki-ai' | 'feishu';
}) {
  const { t } = useTranslation();
  const done = conversation.status !== 'running' && conversation.status !== 'queued';
  const turns = conversation.turns?.length ? conversation.turns : [conversation];

  return (
    <div className="space-y-sm">
      {(showStatus || channel === 'feishu') && (
        <div className="flex items-center gap-xs">
          {showStatus && <ConversationStatusBadge status={conversation.status} />}
          {channel === 'feishu' && (
            <span
              data-testid="conversation-channel-badge-feishu"
              className="rounded-full border border-border bg-surface-elevated px-xs py-0.5 text-[11px] leading-tight text-muted"
            >
              {t('header.search.source.feishu')}
            </span>
          )}
        </div>
      )}
      {turns.map((turn, index) => (
        <ConversationTurn
          key={`${turn.queuedAt ?? 'turn'}-${index}`}
          conversation={turn}
          done={done}
          t={t}
        />
      ))}
    </div>
  );
}

function ConversationTurn({
  conversation,
  done,
  t,
}: {
  conversation: ConversationSessionTurn;
  done: boolean;
  t: ReturnType<typeof useTranslation>['t'];
}) {
  return (
    <div className="space-y-sm">
      <div className="rounded-md bg-primary p-sm text-sm text-primary-text">{conversation.question}</div>
      <div className="space-y-sm rounded-md bg-surface-elevated p-sm text-sm">
        {conversation.thinking && <ChatThinking thinking={conversation.thinking} streaming={!done} />}
        {conversation.insufficient ? (
          <p className="text-muted">{t('ai.chat.insufficient')}</p>
        ) : conversation.errorMessage ? (
          <p className="text-danger">{conversation.errorMessage}</p>
        ) : conversation.answer ? (
          <ChatAnswer text={conversation.answer} citations={conversation.citations} done={done} />
        ) : (
          <p className="text-muted">{t('ai.chat.conversationView.noAnswerYet')}</p>
        )}
        <ChatCitations citations={conversation.citations} />
        {(conversation.toolCalls ?? []).map((call, index) => (
          <details key={`${call.toolName}-${index}`} className="border-t border-border pt-xs text-xs text-muted">
            <summary className="cursor-pointer select-none">{call.toolName} ({call.status})</summary>
            {call.commandMarkdown && <pre className="mt-xs overflow-x-auto whitespace-pre-wrap font-mono">{call.commandMarkdown}</pre>}
          </details>
        ))}
      </div>
    </div>
  );
}
