'use client';

import { useEffect, useState } from 'react';
import type { AiEntitlementView } from '@next-wiki/shared';
import type { PageContext } from '@/components/layout/types';
import { useAiChat } from '@/hooks/use-ai-chat';
import { Button } from '@/components/ui/Button';
import { useTranslation } from '@/i18n/client';
import { ChevronRightIcon, InfoIcon, PlusIcon, SendIcon, SparklesIcon, StopIcon } from '@/components/icons';
import { Tooltip } from '@/components/ui/Tooltip';
import { useChatStore } from './chat-store';
import { ChatAnswer } from './ChatAnswer';
import { ChatCitations } from './ChatCitations';
import { ChatThinking } from './ChatThinking';
import { ToolCallTimeline } from './ToolCallTimeline';

function setAiUrl(open: boolean) {
  const url = new URL(window.location.href);
  if (open) url.searchParams.set('ai', 'open');
  else url.searchParams.delete('ai');
  window.history.replaceState(null, '', url);
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
  return (
    <aside className="flex h-full min-h-0 w-[24rem] max-w-full shrink-0 flex-col overflow-hidden border-l border-border bg-surface">
      <div className="shrink-0 flex items-center justify-between border-b border-border p-md">
        <div>
          <div className="flex items-center gap-xs">
            <h2 className="font-display font-semibold">{t('ai.chat.title')}</h2>
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
          <Tooltip label={t('ai.chat.collapse')}>
            <Button
              size="icon"
              variant="ghost"
              aria-label={t('ai.chat.collapse')}
              onClick={() => { chat.setOpen(false); setAiUrl(false); }}
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
                {(message.thinking || message.toolCalls?.length || message.toolProposals?.length) && (
                  <ChatThinking thinking={message.thinking} streaming={chat.running && message.id === lastAssistantId}>
                    {(message.toolCalls?.length || message.toolProposals?.length) && (
                      <ToolCallTimeline calls={message.toolCalls} proposals={message.toolProposals} embedded />
                    )}
                  </ChatThinking>
                )}
                {message.text ? (
                  <ChatAnswer
                    text={message.text}
                    citations={message.citations}
                    done={!chat.running || message.id !== lastAssistantId}
                  />
                ) : message.insufficient ? (
                  <p className="text-muted">{t('ai.chat.insufficient')}</p>
                ) : (
                  <div className="text-muted">{chat.running ? t('ai.chat.streaming') : ''}</div>
                )}
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
