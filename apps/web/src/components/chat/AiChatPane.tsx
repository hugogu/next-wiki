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
import { syncChatKeyToUrl, takeArrivalChatKey } from './chat-url';
import { restoreLinkedConversation } from './load-conversation';
import { recoverSessionFromServer } from './reconstruct-session';
import { ChatAnswer } from './ChatAnswer';
import { ChatCitations } from './ChatCitations';
import { ChatRetrieval } from './ChatRetrieval';
import { ChatThinking } from './ChatThinking';
import { ToolCallTimeline } from './ToolCallTimeline';
import {
  getAnonymousChatHistoryStatus,
  probeAnonymousChatHistory,
  saveAnonymousChatSession,
  subscribeAnonymousChatHistoryStatus,
  type AnonymousChatHistoryStatus,
} from './anonymous-chat-history';

export { buildMessagesFromDetail } from './load-conversation';

const AI_CHAT_WIDTH_STORAGE_KEY = 'next-wiki:ai-chat-width';
const AI_CHAT_DEFAULT_WIDTH = 384;
const AI_CHAT_MIN_WIDTH = 320;
const AI_CHAT_MAX_WIDTH = 720;
const ANONYMOUS_HISTORY_SAVE_DELAY_MS = 500;

function readChatScrollTop(key: string): number {
  try {
    return Number(sessionStorage.getItem(key) ?? 0);
  } catch {
    return 0;
  }
}

function saveChatScrollTop(key: string, value: number): void {
  try {
    sessionStorage.setItem(key, String(value));
  } catch {
    // Scroll restoration is optional when privacy settings disable storage.
  }
}

export function aiChatPaneClassName(maximized: boolean): string {
  const position = maximized
    ? 'relative h-full w-full flex-1 max-w-none'
    : 'relative h-full w-[var(--ai-chat-width)] max-w-full shrink-0 border-l border-border';
  return `${position} flex min-h-0 flex-col overflow-hidden bg-surface`;
}

/**
 * Whether the pane renders at all. An entitlement view exists for every signed-in
 * account even when the instance has AI switched off, so its presence says
 * nothing — callers deciding on the pane's behalf (the shell's maximized
 * layout) have to ask the same question the pane asks itself.
 */
export function aiChatPaneAvailable(
  entitlements: AiEntitlementView | null | undefined,
): entitlements is AiEntitlementView {
  return Boolean(entitlements?.aiEnabled && entitlements.questionAnsweringEnabled);
}

export function shouldPersistAnonymousChatSnapshot(input: {
  anonymous: boolean;
  rehydrated: boolean;
  running: boolean;
  messageCount: number;
}): boolean {
  return input.anonymous && input.rehydrated && !input.running && input.messageCount > 0;
}

export function AiChatPane({
  entitlements,
  pageContext,
  maximized: maximizedProp,
  onMaximizedChange,
  anonymous = false,
}: {
  entitlements: AiEntitlementView;
  pageContext?: PageContext;
  maximized?: boolean;
  onMaximizedChange?: (maximized: boolean) => void;
  anonymous?: boolean;
}) {
  const { t, locale } = useTranslation();
  const [rehydrated, setRehydrated] = useState(false);
  const [anonymousHistoryStatus, setAnonymousHistoryStatus] = useState<AnonymousChatHistoryStatus>(
    getAnonymousChatHistoryStatus,
  );
  const [question, setQuestion] = useState('');
  const [chatUrlSettled, setChatUrlSettled] = useState(false);
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
  const anonymousSnapshotRef = useRef<{
    sessionId: string;
    mode: typeof chat.mode;
    messages: typeof chat.messages;
    latestQueuedAt: typeof chat.latestQueuedAt;
  } | null>(null);

  // Restore the saved scrollTop once per mount, after the first messages
  // have rendered (the pane rehydrates asynchronously, so waiting for the
  // list to populate avoids restoring into an empty container).
  useEffect(() => {
    if (hasLoadedRef.current) return;
    const list = scrollRef.current;
    if (!list || chat.messages.length === 0) return;
    const saved = readChatScrollTop(SCROLL_STORAGE_KEY);
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
      saveChatScrollTop(SCROLL_STORAGE_KEY, list.scrollHeight);
    }
    prevCountRef.current = chat.messages.length;
  }, [chat.messages.length]);

  // The pane's open/closed state lives entirely in the persisted chat store —
  // rehydration restores `open` on the next mount. Only the *selected
  // conversation* is also an address (`?chat=`, see the effects below), so a
  // thread can be linked to instead of only existing in this tab.
  const onMessageListScroll = () => {
    const list = scrollRef.current;
    if (!list) return;
    requestAnimationFrame(() => {
      saveChatScrollTop(SCROLL_STORAGE_KEY, list.scrollTop);
    });
  };

  useEffect(() => {
    // Hydration is deferred (skipHydration) so the pre-mount render matches
    // the server, then we restore the persisted session. The persisted `open`
    // flag decides whether the pane mounts expanded vs the collapsed FAB; a
    // `?chat=` link then loads its conversation over the top (effect below).
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

  // Arriving on a `?chat=` link loads that conversation over whatever this tab
  // had. It runs before the mirror below starts, so a shared link never strips
  // its own parameter on the way in, and only for the document's first mount
  // (see takeArrivalChatKey) so a later remount cannot replay the arrival.
  useEffect(() => {
    if (!rehydrated || chatUrlSettled) return;
    const key = takeArrivalChatKey();
    if (!key) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- the address bar can only be read after mount, so SSR/hydration render the same "not settled yet" tree
      setChatUrlSettled(true);
      return;
    }
    // The link asked for a conversation, so the pane belongs open even if the
    // key turns out to be unreadable — the shell has already switched to the
    // maximized layout, which has nothing else to show.
    useChatStore.getState().setOpen(true);
    if (key === useChatStore.getState().conversationKey) {
      setChatUrlSettled(true);
      return;
    }
    let cancelled = false;
    void restoreLinkedConversation(key, anonymous, () => cancelled)
      .catch(() => {
        // A key this reader cannot open (deleted, expired, someone else's, or
        // another browser's local history) leaves the pane as it was; the
        // mirror then drops the parameter rather than leaving a dead address.
      })
      .finally(() => {
        if (!cancelled) setChatUrlSettled(true);
      });
    return () => {
      cancelled = true;
    };
  }, [anonymous, rehydrated, chatUrlSettled]);

  // Mirror the loaded conversation into the address bar: selecting one in
  // history stamps `?chat=`, starting a new session clears it. The address only
  // describes what is on screen, so collapsing the pane to its button drops the
  // parameter and reopening restores it — the conversation itself is kept in
  // the store either way.
  useEffect(() => {
    if (!chatUrlSettled) return;
    syncChatKeyToUrl(chat.open ? chat.conversationKey : null);
  }, [chatUrlSettled, chat.open, chat.conversationKey]);

  useEffect(() => {
    if (!anonymous) return;
    const unsubscribe = subscribeAnonymousChatHistoryStatus(setAnonymousHistoryStatus);
    void probeAnonymousChatHistory().then(setAnonymousHistoryStatus);
    return unsubscribe;
  }, [anonymous]);

  // The active pane is still kept in sessionStorage for a fast same-tab
  // restore. Anonymous history is additionally snapshotted in IndexedDB after
  // a turn settles, never once per streamed delta. The latest snapshot remains
  // in a ref so a navigation during streaming still gets a best-effort save.
  useEffect(() => {
    if (!anonymous || !rehydrated || chat.messages.length === 0) return;
    const snapshot = {
      sessionId: chat.sessionId,
      mode: chat.mode,
      messages: chat.messages,
      latestQueuedAt: chat.latestQueuedAt,
    };
    anonymousSnapshotRef.current = snapshot;
    if (!shouldPersistAnonymousChatSnapshot({
      anonymous,
      rehydrated,
      running: chat.running,
      messageCount: chat.messages.length,
    })) return;
    const timeoutId = window.setTimeout(() => {
      void saveAnonymousChatSession(snapshot);
    }, ANONYMOUS_HISTORY_SAVE_DELAY_MS);
    return () => window.clearTimeout(timeoutId);
  }, [anonymous, chat.latestQueuedAt, chat.messages, chat.mode, chat.running, chat.sessionId, rehydrated]);

  useEffect(() => () => {
    const snapshot = anonymousSnapshotRef.current;
    if (snapshot) void saveAnonymousChatSession(snapshot);
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

  if (!aiChatPaneAvailable(entitlements)) return null;
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
          {anonymous && (
            <p className="mt-0.5 text-xs text-muted">
              {anonymousHistoryStatus === 'unavailable'
                ? t('ai.chat.history.localUnavailable')
                : t('ai.chat.history.localOnly')}
            </p>
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
