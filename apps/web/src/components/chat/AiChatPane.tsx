'use client';

import { useEffect, useState } from 'react';
import type { AiEntitlementView } from '@next-wiki/shared';
import type { PageContext } from '@/components/layout/types';
import { useAiChat } from '@/hooks/use-ai-chat';
import { Button } from '@/components/ui/Button';
import { useTranslation } from '@/i18n/client';
import {
  ChevronRightIcon,
  ExpandIcon,
  InfoIcon,
  PlusIcon,
  RestoreIcon,
  SendIcon,
  SparklesIcon,
  StopIcon,
} from '@/components/icons';
import { Tooltip } from '@/components/ui/Tooltip';
import { useChatStore } from './chat-store';
import { recoverSessionFromServer } from './reconstruct-session';
import { ChatAnswer } from './ChatAnswer';
import { ChatCitations } from './ChatCitations';
import { ChatRetrieval } from './ChatRetrieval';
import { ChatThinking } from './ChatThinking';
import { ToolCallTimeline } from './ToolCallTimeline';

function setAiUrl(open: boolean) {
  const url = new URL(window.location.href);
  if (open) url.searchParams.set('ai', 'open');
  else url.searchParams.delete('ai');
  window.history.replaceState(null, '', url);
}

export function aiChatPaneClassName(maximized: boolean): string {
  const position = maximized
    ? 'fixed inset-0 z-50 h-dvh w-full max-w-none'
    : 'relative h-full w-[24rem] max-w-full shrink-0 border-l border-border';
  return `${position} flex min-h-0 flex-col overflow-hidden bg-surface`;
}

export function AiChatPane({
  entitlements,
  pageContext,
}: {
  entitlements: AiEntitlementView;
  pageContext?: PageContext;
}) {
  const { t } = useTranslation();
  const [question, setQuestion] = useState('');
  const [maximized, setMaximized] = useState(false);
  const chat = useAiChat(
    pageContext?.pageId && pageContext.revisionId
      ? { pageId: pageContext.pageId, revisionId: pageContext.revisionId }
      : undefined,
  );

  useEffect(() => {
    // Hydration is deferred (skipHydration) so the pre-mount render matches
    // the server, then we restore the persisted session and let an explicit
    // `?ai=open` links (e.g. a shared URL) override persisted state.
    let cancelled = false;
    void Promise.resolve(useChatStore.persist.rehydrate()).then(() => {
      if (cancelled) return;
      const url = new URL(window.location.href);
      if (url.searchParams.get('ai') === 'open') chat.setOpen(true);
      // After rehydration, reconcile any assistant message that was marked
      // failed client-side with the authoritative server state. The server
      // may have completed the turn despite a proxy/VPN interrupting the
      // POST or EventSource, and a stored actionId is the only handle we
      // need to ask `/api/ai/sessions/{actionId}` for the durable record
      // (preferring the captured Raw conversation over event reconstruction).
      const store = useChatStore.getState();
      const stale = store.messages.filter(
        (message) => message.role === 'assistant' && message.error && message.actionId,
      );
      for (const message of stale) {
        const actionId = message.actionId!;
        void recoverSessionFromServer(actionId).then((recovered) => {
          if (cancelled || !recovered) return;
          const { answer, thinking, citations, toolCalls, searchResults, insufficient, errorMessage, status } = recovered;
          if (status === 'completed') {
            store.recoverMessage(message.id, {
              text: insufficient ? '' : answer,
              thinking,
              citations,
              toolCalls,
              searchResults,
              insufficient,
            });
          } else if (status === 'failed' || status === 'cancelled' || status === 'expired') {
            // The server confirms the failure — overwrite the (possibly less
            // accurate) client-side error string with whatever the server has.
            store.recoverMessage(message.id, { error: errorMessage ?? 'AI request failed' });
          }
          // queued/running: leave the message alone; the server is still
          // processing and the EventSource would have handled it otherwise.
        }).catch(() => {
          // Network blip — keep the persisted error, try again next mount.
        });
      }
    });
    return () => {
      cancelled = true;
    };
    // Runs once per mount; chat identity is stable across the pane's lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!entitlements.aiEnabled || !entitlements.questionAnsweringEnabled) return null;
  if (!chat.open) {
    return (
      <div className="fixed bottom-lg right-lg z-30">
        <Tooltip label={t('ai.chat.open')}>
          <Button
            size="icon"
            className="rounded-full shadow-lg"
            aria-label={t('ai.chat.open')}
            onClick={() => { chat.setOpen(true); setAiUrl(true); }}
          >
            <SparklesIcon />
          </Button>
        </Tooltip>
      </div>
    );
  }
  const lastAssistantId = [...chat.messages].reverse().find((message) => message.role === 'assistant')?.id;
  const streamingAssistantId = chat.running ? lastAssistantId : undefined;
  return (
    <aside className={aiChatPaneClassName(maximized)}>
      <div className="relative z-10 flex shrink-0 items-center justify-between border-b border-border px-sm py-sm">
        <div>
          <div className="flex items-center gap-xs">
            <h2 className="font-display text-base font-semibold">{t('ai.chat.title')}</h2>
            <Tooltip label={t('ai.chat.providerNotice')}>
              <span tabIndex={0} aria-label={t('ai.chat.providerNotice')} className="inline-flex text-muted outline-none focus:text-foreground">
                <InfoIcon className="h-4 w-4" />
              </span>
            </Tooltip>
          </div>
        </div>
        <div className="flex items-center gap-xs">
          <Tooltip label={t('ai.chat.newSession')}>
            <Button
              size="icon"
              variant="ghost"
              aria-label={t('ai.chat.newSession')}
              disabled={chat.messages.length === 0}
              onClick={() => { chat.cancel(); chat.newSession(); }}
            >
              <PlusIcon />
            </Button>
          </Tooltip>
          <Tooltip label={maximized ? t('ai.chat.restore') : t('ai.chat.maximize')}>
            <Button
              size="icon"
              variant="ghost"
              aria-label={maximized ? t('ai.chat.restore') : t('ai.chat.maximize')}
              aria-pressed={maximized}
              onClick={() => setMaximized((value) => !value)}
            >
              {maximized ? <RestoreIcon /> : <ExpandIcon />}
            </Button>
          </Tooltip>
          <Tooltip label={t('ai.chat.collapse')}>
            <Button
              size="icon"
              variant="ghost"
              aria-label={t('ai.chat.collapse')}
              onClick={() => { setMaximized(false); chat.setOpen(false); setAiUrl(false); }}
            >
              <ChevronRightIcon />
            </Button>
          </Tooltip>
        </div>
      </div>
      <div className="min-w-0 flex-1 space-y-md overflow-auto p-md">
        {chat.messages.length === 0 && <p className="text-sm text-muted">{t('ai.chat.empty')}</p>}
        {chat.messages.map((message) => (
          <article key={message.id} className={`min-w-0 max-w-full overflow-hidden rounded-lg p-sm text-sm ${message.role === 'user' ? 'ml-lg bg-primary text-primary-text' : 'mr-lg bg-surface-elevated'}`}>
            {message.role === 'assistant' ? (
              <div className="min-w-0 space-y-sm">
                {(message.thinking || message.searchResults?.length || message.toolCalls?.length || message.toolProposals?.length) && (
                  <ChatThinking thinking={message.thinking} streaming={message.id === streamingAssistantId}>
                    <>
                      {message.searchResults?.length ? <ChatRetrieval results={message.searchResults} /> : null}
                      {(message.toolCalls?.length || message.toolProposals?.length) && (
                        <ToolCallTimeline calls={message.toolCalls} proposals={message.toolProposals} embedded />
                      )}
                    </>
                  </ChatThinking>
                )}
                {message.text ? (
                  <ChatAnswer
                    text={message.text}
                    citations={message.citations}
                    done={message.id !== streamingAssistantId}
                  />
                ) : message.insufficient ? (
                  <p className="text-muted">{t('ai.chat.insufficient')}</p>
                ) : message.id === streamingAssistantId ? (
                  <div className="text-muted">
                    {message.searchResults ? t('ai.chat.streaming') : t('ai.chat.retrieving')}
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="min-w-0 whitespace-pre-wrap break-words">{message.text}</div>
            )}
            {message.error && <p className="mt-xs text-danger">{message.error}</p>}
            {message.error && message.role === 'assistant' && (
              <button
                type="button"
                className="mt-xs text-xs text-primary hover:underline"
                onClick={() => {
                  const index = chat.messages.findIndex((item) => item.id === message.id);
                  const previous = index > 0 ? chat.messages[index - 1] : null;
                  if (previous?.role === 'user') void chat.ask(previous.text, 'retrieval');
                }}
              >
                {t('ai.chat.retry')}
              </button>
            )}
            <ChatCitations citations={message.citations} />
          </article>
        ))}
      </div>
      <form
        className="flex shrink-0 items-end gap-sm border-t border-border p-md"
        onSubmit={(event) => {
          event.preventDefault();
          const value = question.trim();
          if (!value || chat.running) return;
          setQuestion('');
          void chat.ask(value, 'retrieval');
        }}
      >
        <textarea
          className="min-h-10 max-h-40 min-w-0 flex-1 resize-y rounded-md border border-border bg-background p-sm text-sm"
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder={t('ai.chat.placeholder')}
          maxLength={16_000}
        />
        <Tooltip label={chat.running ? t('ai.chat.stop') : t('ai.chat.send')}>
          <Button
            type={chat.running ? 'button' : 'submit'}
            size="icon"
            aria-label={chat.running ? t('ai.chat.stop') : t('ai.chat.send')}
            disabled={!chat.running && !question.trim()}
            onClick={chat.running ? () => { void chat.cancel(); } : undefined}
          >
            {chat.running ? <StopIcon /> : <SendIcon />}
          </Button>
        </Tooltip>
      </form>
    </aside>
  );
}
