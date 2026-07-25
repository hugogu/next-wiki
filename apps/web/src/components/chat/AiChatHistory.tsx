'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { AiConversationListResponse, AiConversationSummary } from '@next-wiki/shared';
import { useTranslation } from '@/i18n/client';
import { apiDelete, apiGet, type ApiError } from '@/lib/api/client';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { PlusIcon, SparklesIcon, TrashIcon } from '@/components/icons';
import { useChatStore } from './chat-store';

const PAGE_SIZE = 50;

export function AiChatHistory() {
  const { t } = useTranslation();
  const router = useRouter();
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

  const handleContinue = (conversation: AiConversationSummary) => {
    setContinuingKey(conversation.conversationKey);
    // Reflect the continued conversation in the URL so it can be shared.
    // The chat pane itself reads the `chat` query param and loads the detail.
    const params = new URLSearchParams(window.location.search);
    params.set('chat', conversation.conversationKey);
    router.replace(`${window.location.pathname}?${params.toString()}`);
    setContinuingKey(null);
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
