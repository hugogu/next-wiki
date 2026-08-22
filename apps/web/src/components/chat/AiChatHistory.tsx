'use client';

import { useEffect, useState } from 'react';
import type { AiConversationListResponse, AiConversationSummary } from '@next-wiki/shared';
import { useTranslation } from '@/i18n/client';
import { apiDelete, apiGet, type ApiError } from '@/lib/api/client';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { PlusIcon, SparklesIcon, TrashIcon } from '@/components/icons';
import { useChatStore } from './chat-store';
import { loadConversationFromKey } from './load-conversation';
import {
  deleteAnonymousChatSession,
  getAnonymousChatHistoryStatus,
  listAnonymousChatSessions,
  probeAnonymousChatHistory,
  subscribeAnonymousChatHistoryStatus,
  type AnonymousChatHistoryStatus,
  type AnonymousChatSession,
} from './anonymous-chat-history';

const PAGE_SIZE = 50;

export function AiChatHistory({ anonymous = false }: { anonymous?: boolean }) {
  return anonymous ? <AnonymousAiChatHistory /> : <AccountAiChatHistory />;
}

function AccountAiChatHistory() {
  const { t } = useTranslation();
  const newSession = useChatStore((state) => state.newSession);

  const [items, setItems] = useState<AiConversationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [continuingKey, setContinuingKey] = useState<string | null>(null);
  const [deleteKey, setDeleteKey] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

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

  // Loads the historical conversation straight into the chat store — no URL
  // round-trip, so the active session id never appears in the address bar
  // (and the page stays shareable as a plain wiki URL).
  const handleContinue = async (conversation: AiConversationSummary) => {
    setContinuingKey(conversation.conversationKey);
    try {
      await loadConversationFromKey(conversation.conversationKey);
    } finally {
      setContinuingKey(null);
    }
  };

  const handleDelete = async () => {
    if (!deleteKey) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await apiDelete<void>(`/api/ai/sessions/${encodeURIComponent(deleteKey)}`);
      setItems((prev) => prev.filter((item) => item.conversationKey !== deleteKey));
      setDeleteKey(null);
    } catch (err) {
      const apiError = err as ApiError;
      setDeleteError(apiError.message || t('ai.chat.history.deleteError'));
    } finally {
      setDeleting(false);
    }
  };

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
            <li
              key={conversation.conversationKey}
              className="group flex items-center gap-1 rounded-md transition-colors hover:bg-surface-elevated"
            >
              <button
                type="button"
                onClick={() => void handleContinue(conversation)}
                disabled={continuingKey === conversation.conversationKey}
                className="min-w-0 flex-1 rounded-md px-md py-2 text-left text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-50"
              >
                <span className="flex items-center gap-xs">
                  <span className="min-w-0 flex-1 truncate font-medium">
                    {conversation.questionExcerpt ?? t('ai.chat.history.contentExpired')}
                  </span>
                  {continuingKey === conversation.conversationKey && (
                    <SparklesIcon className="h-4 w-4 shrink-0 text-muted" />
                  )}
                </span>
              </button>
              <button
                type="button"
                onClick={() => setDeleteKey(conversation.conversationKey)}
                disabled={deleting}
                aria-label={t('ai.chat.history.delete')}
                title={t('ai.chat.history.delete')}
                className="shrink-0 rounded-md px-sm text-muted transition-colors hover:text-danger focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-50"
              >
                <TrashIcon className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {deleteKey && (
        <ConfirmDialog
          title={t('ai.chat.history.deleteConfirmTitle')}
          message={t('ai.chat.history.deleteConfirmMessage')}
          confirmLabel={t('ai.chat.history.delete')}
          confirmVariant="danger"
          pending={deleting}
          error={deleteError ?? undefined}
          onConfirm={handleDelete}
          onCancel={() => {
            if (!deleting) setDeleteKey(null);
          }}
        />
      )}
    </div>
  );
}

function AnonymousAiChatHistory() {
  const { t } = useTranslation();
  const newSession = useChatStore((state) => state.newSession);
  const restoreSession = useChatStore((state) => state.restoreSession);
  const [items, setItems] = useState<AnonymousChatSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [storageStatus, setStorageStatus] = useState<AnonymousChatHistoryStatus>(
    getAnonymousChatHistoryStatus,
  );
  const [deleteId, setDeleteId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      const [nextStatus, sessions] = await Promise.all([
        probeAnonymousChatHistory(),
        listAnonymousChatSessions(),
      ]);
      if (cancelled) return;
      setStorageStatus(nextStatus);
      setItems(sessions);
      setLoading(false);
    };
    const unsubscribe = subscribeAnonymousChatHistoryStatus(setStorageStatus);
    void refresh();
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  const handleContinue = (session: AnonymousChatSession) => {
    restoreSession({
      sessionId: session.sessionId,
      mode: session.mode,
      messages: session.messages,
      latestQueuedAt: session.latestQueuedAt,
    });
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    await deleteAnonymousChatSession(deleteId);
    setItems((previous) => previous.filter((item) => item.sessionId !== deleteId));
    setDeleteId(null);
  };

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

      {storageStatus === 'unavailable' && (
        <p className="px-md text-sm text-warning">{t('ai.chat.history.localUnavailable')}</p>
      )}
      {storageStatus !== 'unavailable' && (
        <p className="px-md text-xs text-muted">{t('ai.chat.history.localOnly')}</p>
      )}
      {loading && <p className="px-md text-sm text-muted">{t('common.status.loading')}</p>}
      {!loading && items.length === 0 && (
        <p className="px-md text-sm text-muted">{t('ai.chat.history.empty')}</p>
      )}

      {items.length > 0 && (
        <ul className="space-y-1">
          {items.map((session) => {
            const firstQuestion = session.messages.find((message) => message.role === 'user')?.text;
            return (
              <li
                key={session.sessionId}
                className="group flex items-center gap-1 rounded-md transition-colors hover:bg-surface-elevated"
              >
                <button
                  type="button"
                  onClick={() => handleContinue(session)}
                  className="min-w-0 flex-1 rounded-md px-md py-2 text-left text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-primary/50"
                >
                  <span className="block truncate font-medium">
                    {firstQuestion ?? t('ai.chat.history.contentExpired')}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setDeleteId(session.sessionId)}
                  aria-label={t('ai.chat.history.delete')}
                  title={t('ai.chat.history.delete')}
                  className="shrink-0 rounded-md px-sm text-muted transition-colors hover:text-danger focus:outline-none focus:ring-2 focus:ring-primary/50"
                >
                  <TrashIcon className="h-4 w-4" />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {deleteId && (
        <ConfirmDialog
          title={t('ai.chat.history.deleteConfirmTitle')}
          message={t('ai.chat.history.deleteConfirmMessage')}
          confirmLabel={t('ai.chat.history.delete')}
          confirmVariant="danger"
          onConfirm={() => void handleDelete()}
          onCancel={() => setDeleteId(null)}
        />
      )}
    </div>
  );
}
