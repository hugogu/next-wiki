'use client';

import { useEffect, useState } from 'react';
import type { AiEntitlementView, AiQuestionMode } from '@next-wiki/shared';
import type { PageContext } from '@/components/layout/types';
import { useAiChat } from '@/hooks/use-ai-chat';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { useTranslation } from '@/i18n/client';
import { ChevronRightIcon, PlusIcon, SparklesIcon } from '@/components/icons';
import { Tooltip } from '@/components/ui/Tooltip';
import { useChatStore } from './chat-store';
import { ChatAnswer } from './ChatAnswer';
import { ChatCitations } from './ChatCitations';
import { ChatThinking } from './ChatThinking';
import { ToolCallTimeline } from './ToolCallTimeline';

function setAiUrl(open: boolean, mode: AiQuestionMode) {
  const url = new URL(window.location.href);
  if (open) url.searchParams.set('ai', 'open');
  else url.searchParams.delete('ai');
  url.searchParams.set('aiMode', mode);
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
    // `?ai=open`/`?aiMode=full` link (e.g. a shared URL) override it.
    let cancelled = false;
    void Promise.resolve(useChatStore.persist.rehydrate()).then(() => {
      if (cancelled) return;
      const url = new URL(window.location.href);
      if (url.searchParams.get('ai') === 'open') chat.setOpen(true);
      if (url.searchParams.get('aiMode') === 'full') chat.setMode('full');
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
            onClick={() => { chat.setOpen(true); setAiUrl(true, chat.mode); }}
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
          <h2 className="font-display font-semibold">{t('ai.chat.title')}</h2>
          <p className="text-xs text-muted">{t('ai.chat.providerNotice')}</p>
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
              onClick={() => { chat.setOpen(false); setAiUrl(false, chat.mode); }}
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
                {message.thinking && (
                  <ChatThinking thinking={message.thinking} streaming={chat.running && message.id === lastAssistantId} />
                )}
                <ToolCallTimeline calls={message.toolCalls} proposals={message.toolProposals} />
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
                  if (previous?.role === 'user') void chat.ask(previous.text, chat.mode);
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
        className="shrink-0 space-y-sm border-t border-border p-md"
        onSubmit={(event) => {
          event.preventDefault();
          const value = question.trim();
          if (!value || chat.running) return;
          setQuestion('');
          void chat.ask(value, chat.mode);
        }}
      >
        <Select
          value={chat.mode}
          onChange={(event) => {
            const mode = event.target.value as AiQuestionMode;
            chat.setMode(mode);
            setAiUrl(true, mode);
          }}
        >
          <option value="retrieval">{t('ai.chat.mode.retrieval')}</option>
          <option value="full">{t('ai.chat.mode.full')}</option>
        </Select>
        <textarea
          className="min-h-24 w-full rounded-md border border-border bg-background p-sm text-sm"
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder={t('ai.chat.placeholder')}
          maxLength={16_000}
        />
        <Button type="submit" disabled={chat.running || !question.trim()} className="w-full">
          {chat.running ? t('ai.chat.streaming') : t('ai.chat.send')}
        </Button>
      </form>
    </aside>
  );
}
