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

/**
 * Shared conversation detail body for a Wiki AI question/answer session —
 * reused by AI Chat History detail (legacy event-log reconstruction) and by
 * the Raw Conversation reader (captured page snapshot), so both surfaces
 * render identically. Deliberately has no header/action controls of its own;
 * callers keep session-level actions (continue, delete, close) in their own
 * header per the UI contract.
 */
export function ConversationSessionView({ conversation }: { conversation: ConversationSessionViewModel }) {
  const { t } = useTranslation();
  const done = conversation.status !== 'running' && conversation.status !== 'queued';

  return (
    <div className="space-y-sm">
      <div>
        <StatusBadge tone={STATUS_TONE[conversation.status]}>{t(STATUS_LABELS[conversation.status])}</StatusBadge>
      </div>
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
