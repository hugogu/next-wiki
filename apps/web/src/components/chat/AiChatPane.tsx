'use client';

import { useEffect, useRef, useState } from 'react';
import type { AiEntitlementView } from '@next-wiki/shared';
import type { PageContext } from '@/components/layout/types';
import { useAiChat } from '@/hooks/use-ai-chat';
import { useResizableWidth } from '@/hooks/use-resizable-width';
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

export { buildMessagesFromDetail } from './load-conversation';

const AI_CHAT_WIDTH_STORAGE_KEY = 'next-wiki:ai-chat-width';
const AI_CHAT_DEFAULT_WIDTH = 384;
const AI_CHAT_MIN_WIDTH = 320;
const AI_CHAT_MAX_WIDTH = 720;

export function aiChatPaneClassName(maximized: boolean): string {
  const position = maximized
    ? 'relative h-full w-full flex-1 max-w-none'
    : 'relative h-full w-[var(--ai-chat-width)] max-w-full shrink-0 border-l border-border';
  return `${position} flex min-h-0 flex-col overflow-hidden bg-surface`;
}

export function AiChatPane({
  entitlements,
  pageContext,
  maximized: maximizedProp,
  onMaximizedChange,
}: {
  entitlements: AiEntitlementView;
  pageContext?: PageContext;
  maximized?: boolean;
  onMaximizedChange?: (maximized: boolean) => void;
}) {
  const { t, locale } = useTranslation();
  const [rehydrated, setRehydrated] = useState(false);
  const [question, setQuestion] = useState('');
  const [internalMaximized, setInternalMaximized] = useState(false);
  const maximized = maximizedProp ?? internalMaximized;
  const setMaximized = (value: boolean) => {
    onMaximizedChange?.(value);
    setInternalMaximized(value);
  };
  const { width: chatWidth, startResize: startChatResize } = useResizableWidth({
    storageKey: AI_CHAT_WIDTH_STORAGE_KEY,
    defaultWidth: AI_CHAT_DEFAULT_WIDTH,
    minWidth: AI_CHAT_MIN_WIDTH,
    maxWidth: AI_CHAT_MAX_WIDTH,
    side: 'left',
  });
  const chat = useAiChat(
    pageContext?.pageId && pageContext.revisionId
      ? { pageId: pageContext.pageId, revisionId: pageContext.revisionId }
      : undefined,
  );
  // Destructure the pieces we need in effect dependency arrays. `cancel` is
  // stable; `running` is the reactive signal that starts/stops recovery polling.
  const { running, cancel } = chat;

  // Scroll persistence for the message list. The pane is a floating,
  // app-like region whose content lives in sessionStorage; without this,
  // navigating between pages (which remounts the shell and thus the pane)
  // always snaps the list back to the top. Persist scrollTop in
  // sessionStorage and restore it on mount; on scroll, save it again.
  const SCROLL_STORAGE_KEY = 'ai-chat-scroll-top';
  const scrollRef = useRef<HTMLDivElement>(null);
  const hasLoadedRef = useRef(false);
  const prevCountRef = useRef(0);

  // Restore the saved scrollTop once per mount, after the first messages
  // have rendered (the pane rehydrates asynchronously, so waiting for the
  // list to populate avoids restoring into an empty container).
  useEffect(() => {
    if (hasLoadedRef.current) return;
    const list = scrollRef.current;
    if (!list || chat.messages.length === 0) return;
    const saved = Number(sessionStorage.getItem(SCROLL_STORAGE_KEY) ?? 0);
    if (saved > 0) {
      // Defer one frame so the browser has laid out the restored messages.
      requestAnimationFrame(() => {
        list.scrollTop = saved;
        prevCountRef.current = chat.messages.length;
        hasLoadedRef.current = true;
      });
    } else {
      hasLoadedRef.current = true;
      prevCountRef.current = chat.messages.length;
    }
  }, [chat.messages.length]);

  // Keep scroll pinned to the bottom when a new turn is appended (the user
  // sent a question, or an assistant turn started streaming) so the live
  // response is always visible; otherwise a previously saved scrollTop is
  // honored. Only fires after the initial load has restored scrollTop, so
  // a fresh mount doesn't override the restore.
  useEffect(() => {
    const list = scrollRef.current;
    if (!list || !hasLoadedRef.current) return;
    if (chat.messages.length > prevCountRef.current) {
      list.scrollTop = list.scrollHeight;
      sessionStorage.setItem(SCROLL_STORAGE_KEY, String(list.scrollHeight));
    }
    prevCountRef.current = chat.messages.length;
  }, [chat.messages.length]);

  // The pane's open/closed state and current session live entirely in the
  // persisted chat store, so no URL synchronisation is needed: rehydration
  // restores `open` on the next mount, and "Continue" in history writes
  // straight into the store via loadConversationFromKey.
  const onMessageListScroll = () => {
    const list = scrollRef.current;
    if (!list) return;
    requestAnimationFrame(() => {
      sessionStorage.setItem(SCROLL_STORAGE_KEY, String(list.scrollTop));
    });
  };

  useEffect(() => {
    // Hydration is deferred (skipHydration) so the pre-mount render matches
    // the server, then we restore the persisted session. The persisted `open`
    // flag is enough to decide whether the pane should mount expanded vs the
    // collapsed FAB — no URL signal is consulted.
    let cancelled = false;
    void Promise.resolve(useChatStore.persist.rehydrate()).then(() => {
      if (cancelled) return;
      setRehydrated(true);
      // After rehydration, reconcile any assistant message that was marked
      // failed client-side with the authoritative server state. The server
      // may have completed the turn despite a proxy/VPN interrupting the
      // POST or EventSource, and a stored actionId is the only handle we
      // need to ask `/api/ai/sessions/legacy:turn:{actionId}` for the durable
      // record (preferring the captured Raw conversation over event reconstruction).
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
  }, []);

  const formatDate = (value: string) => new Date(value).toLocaleString(locale);

  // If the EventSource silently stalls (proxy/VPN dropped the connection and
  // the browser did not reconnect), poll the authoritative server state for the
  // running turn. This converts a "frozen spinner" into a recovered answer
  // without requiring the user to refresh the page.
  useEffect(() => {
    if (!rehydrated || !running) return;
    let cancelled = false;
    const poll = async () => {
      const store = useChatStore.getState();
      const lastAssistant = [...store.messages].reverse().find((message) => message.role === 'assistant');
      if (!lastAssistant?.actionId) return;
      const recovered = await recoverSessionFromServer(lastAssistant.actionId);
      if (cancelled || !recovered) return;
      const { answer, thinking, citations, toolCalls, searchResults, insufficient, errorMessage, status } = recovered;
      if (status === 'completed') {
        store.recoverMessage(lastAssistant.id, {
          text: insufficient ? '' : answer,
          thinking,
          citations,
          toolCalls,
          searchResults,
          insufficient,
        });
        cancel();
      } else if (status === 'failed' || status === 'cancelled' || status === 'expired') {
        store.recoverMessage(lastAssistant.id, { error: errorMessage ?? 'AI request failed' });
        cancel();
      }
      // queued/running: keep polling.
    };
    const interval = window.setInterval(() => { void poll(); }, 10_000);
    void poll();
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [rehydrated, running, cancel]);

  if (!entitlements.aiEnabled || !entitlements.questionAnsweringEnabled) return null;
  if (!chat.open) {
    return (
      <div className="fixed bottom-lg right-lg z-30">
        <Tooltip label={t('ai.chat.open')}>
          <Button
            size="icon"
            className="rounded-full shadow-lg"
            aria-label={t('ai.chat.open')}
            onClick={() => { chat.setOpen(true); }}
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
    <aside
      className={aiChatPaneClassName(maximized)}
      style={{ '--ai-chat-width': `${chatWidth}px` } as React.CSSProperties}
    >
      {!maximized && (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label={t('ai.chat.resizeHandle')}
          onPointerDown={startChatResize}
          className="absolute inset-y-0 left-0 z-10 w-1.5 cursor-col-resize touch-none select-none hover:bg-primary/30 active:bg-primary/50"
        />
      )}
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
          {chat.latestQueuedAt && (
            <time
              className="block text-xs text-muted"
              dateTime={chat.latestQueuedAt}
              title={t('ai.chat.conversationView.latestAt', { time: formatDate(chat.latestQueuedAt) })}
            >
              {formatDate(chat.latestQueuedAt)}
            </time>
          )}
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
              onClick={() => setMaximized(!maximized)}
            >
              {maximized ? <RestoreIcon /> : <ExpandIcon />}
            </Button>
          </Tooltip>
          <Tooltip label={t('ai.chat.collapse')}>
            <Button
              size="icon"
              variant="ghost"
              aria-label={t('ai.chat.collapse')}
              onClick={() => { setMaximized(false); chat.setOpen(false); }}
            >
              <ChevronRightIcon />
            </Button>
          </Tooltip>
        </div>
      </div>
      <div ref={scrollRef} onScroll={onMessageListScroll} className="min-w-0 flex-1 space-y-md overflow-auto p-md">
        {chat.messages.length === 0 && <p className="text-sm text-muted">{t('ai.chat.empty')}</p>}
        {chat.messages.map((message) => (
          <article key={message.id} className={`min-w-0 overflow-hidden rounded-lg p-sm text-sm ${message.role === 'user' ? 'ml-auto mr-lg max-w-[50%] bg-primary text-primary-text' : 'mr-lg max-w-full bg-surface-elevated'}`}>
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
