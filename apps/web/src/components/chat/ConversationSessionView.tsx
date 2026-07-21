'use client';

import type { ConversationSessionViewModel } from '@next-wiki/shared';
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
}: {
  conversation: ConversationSessionViewModel;
  showStatus?: boolean;
}) {
  const { t } = useTranslation();
  const done = conversation.status !== 'running' && conversation.status !== 'queued';

  return (
    <div className="space-y-sm">
      {showStatus && (
        <div>
          <ConversationStatusBadge status={conversation.status} />
        </div>
      )}
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
      </div>
    </div>
  );
}
