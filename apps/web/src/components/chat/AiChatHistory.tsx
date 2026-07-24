'use client';

import { useEffect, useState } from 'react';
import type {
  AiConversationDetail,
  AiConversationListResponse,
  AiConversationSummary,
} from '@next-wiki/shared';
import { useTranslation } from '@/i18n/client';
import { apiGet } from '@/lib/api/client';
import { Button } from '@/components/ui/Button';
import { PlusIcon, SparklesIcon } from '@/components/icons';
import { useChatStore } from './chat-store';
import { reconstructSessionFromEvents } from './reconstruct-session';
import { resolveSessionId } from './resolve-session-id';

const PAGE_SIZE = 50;

async function fetchDetail(id: string): Promise<AiConversationDetail | null> {
  try {
    return await apiGet<AiConversationDetail>(`/api/ai/sessions/${encodeURIComponent(id)}`);
  } catch {
    return null;
  }
}

export function AiChatHistory() {
  const { t, locale } = useTranslation();
  const newSession = useChatStore((state) => state.newSession);
  const restoreSession = useChatStore((state) => state.restoreSession);

  const [items, setItems] = useState<AiConversationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [continuingKey, setContinuingKey] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiGet<AiConversationListResponse>(`/api/ai/sessions?limit=${PAGE_SIZE}&offset=0`)
      .then((result) => {
        if (cancelled) return;
        setItems(result.items);
      })
      .catch(() => {
        if (cancelled) return;
        setError(t('ai.chat.history.loadError'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [t]);

  const handleContinue = async (conversation: AiConversationSummary) => {
    setContinuingKey(conversation.conversationKey);
    try {
      const detail = await fetchDetail(conversation.conversationKey);
      if (!detail) {
        setError(t('ai.chat.history.loadError'));
        return;
      }
      const messages: ReturnType<typeof useChatStore.getState>['messages'] = [];
      for (const turn of detail.turns) {
        const reconstructed = reconstructSessionFromEvents(turn.events);
        messages.push({
          id: crypto.randomUUID(),
          role: 'user',
          text: reconstructed.question,
        });
        messages.push({
          id: crypto.randomUUID(),
          role: 'assistant',
          text: reconstructed.insufficient ? '' : reconstructed.answer,
          thinking: reconstructed.thinking,
          citations: reconstructed.citations,
          toolCalls: reconstructed.toolCalls,
          searchResults: reconstructed.searchResults,
          insufficient: reconstructed.insufficient,
          error: reconstructed.errorMessage ?? undefined,
        });
      }
      restoreSession({
        sessionId: resolveSessionId(conversation, detail),
        mode: detail.turns.at(-1)?.action.questionMode ?? 'retrieval',
        messages,
      });
    } finally {
      setContinuingKey(null);
    }
  };

  const formatDate = (value: string) => new Date(value).toLocaleString(locale);

  return (
    <div className="space-y-sm">
      <div className="flex items-center justify-between px-md py-sm">
        <h2 className="font-display text-sm font-semibold">{t('ai.chat.history.title')}</h2>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          onClick={() => newSession()}
          aria-label={t('ai.chat.history.newSession')}
          title={t('ai.chat.history.newSession')}
        >
          <PlusIcon className="h-4 w-4" />
        </Button>
      </div>

      {loading && <p className="px-md text-sm text-muted">{t('common.status.loading')}</p>}
      {error && <p className="px-md text-sm text-danger">{error}</p>}
      {!loading && items.length === 0 && !error && (
        <p className="px-md text-sm text-muted">{t('ai.chat.history.empty')}</p>
      )}

      {items.length > 0 && (
        <ul className="space-y-1">
          {items.map((conversation) => (
            <li key={conversation.conversationKey}>
              <button
                type="button"
                onClick={() => void handleContinue(conversation)}
                disabled={continuingKey === conversation.conversationKey}
                className="w-full rounded-md px-md py-2 text-left text-sm transition-colors hover:bg-surface-elevated focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-50"
              >
                <div className="flex items-start justify-between gap-xs">
                  <span className="min-w-0 flex-1 truncate font-medium">
                    {conversation.questionExcerpt ?? t('ai.chat.history.contentExpired')}
                  </span>
                  {continuingKey === conversation.conversationKey && (
                    <SparklesIcon className="h-4 w-4 shrink-0 text-muted" />
                  )}
                </div>
                <div className="mt-xs flex items-center gap-xs text-xs text-muted">
                  <span>{t('ai.chat.history.turnCount', { count: conversation.turnCount })}</span>
                  <span aria-hidden="true">·</span>
                  <span>{formatDate(conversation.latestQueuedAt)}</span>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
