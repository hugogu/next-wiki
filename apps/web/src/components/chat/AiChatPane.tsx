'use client';

import { useEffect, useState } from 'react';
import type { AiEntitlementView, AiQuestionMode } from '@next-wiki/shared';
import type { PageContext } from '@/components/layout/types';
import { useAiChat } from '@/hooks/use-ai-chat';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { useTranslation } from '@/i18n/client';
import { ChevronRightIcon, SparklesIcon } from '@/components/icons';
import { Tooltip } from '@/components/ui/Tooltip';
import { ChatAnswer } from './ChatAnswer';
import { ChatThinking } from './ChatThinking';

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
  const initialMode =
    typeof window !== 'undefined' && new URL(window.location.href).searchParams.get('aiMode') === 'full'
      ? 'full'
      : 'retrieval';
  const [open, setOpen] = useState(
    () => typeof window !== 'undefined' && new URL(window.location.href).searchParams.get('ai') === 'open',
  );
  const [question, setQuestion] = useState('');
  const chat = useAiChat(
    pageContext?.pageId && pageContext.revisionId
      ? { pageId: pageContext.pageId, revisionId: pageContext.revisionId }
      : undefined,
  );

  useEffect(() => {
    chat.setMode(initialMode);
    // Initial URL state is intentionally read once per mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!entitlements.aiEnabled || !entitlements.questionAnsweringEnabled) return null;
  if (!open) {
    return (
      <div className="fixed bottom-lg right-lg z-30">
        <Tooltip label={t('ai.chat.open')}>
          <Button
            size="icon"
            className="rounded-full shadow-lg"
            aria-label={t('ai.chat.open')}
            onClick={() => { setOpen(true); setAiUrl(true, chat.mode); }}
          >
            <SparklesIcon />
          </Button>
        </Tooltip>
      </div>
    );
  }
  const lastAssistantId = [...chat.messages].reverse().find((message) => message.role === 'assistant')?.id;
  return (
    <aside className="flex h-full w-[24rem] shrink-0 flex-col border-l border-border bg-surface">
      <div className="flex items-center justify-between border-b border-border p-md">
        <div>
          <h2 className="font-display font-semibold">{t('ai.chat.title')}</h2>
          <p className="text-xs text-muted">{t('ai.chat.providerNotice')}</p>
        </div>
        <Tooltip label={t('ai.chat.collapse')}>
          <Button
            size="icon"
            variant="ghost"
            aria-label={t('ai.chat.collapse')}
            onClick={() => { setOpen(false); setAiUrl(false, chat.mode); }}
          >
            <ChevronRightIcon />
          </Button>
        </Tooltip>
      </div>
      <div className="flex-1 space-y-md overflow-auto p-md">
        {chat.messages.length === 0 && <p className="text-sm text-muted">{t('ai.chat.empty')}</p>}
        {chat.messages.map((message) => (
          <article key={message.id} className={`rounded-lg p-sm text-sm ${message.role === 'user' ? 'ml-lg bg-primary text-primary-text' : 'mr-lg bg-surface-elevated'}`}>
            {message.role === 'assistant' ? (
              <div className="space-y-sm">
                {message.thinking && (
                  <ChatThinking thinking={message.thinking} streaming={chat.running && message.id === lastAssistantId} />
                )}
                {message.text ? (
                  <ChatAnswer text={message.text} done={!chat.running || message.id !== lastAssistantId} />
                ) : message.insufficient ? (
                  <p className="text-muted">{t('ai.chat.insufficient')}</p>
                ) : (
                  <div className="text-muted">{chat.running ? t('ai.chat.streaming') : ''}</div>
                )}
              </div>
            ) : (
              <div className="whitespace-pre-wrap">{message.text}</div>
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
            {message.citations?.length ? (
              <ul className="mt-sm space-y-xs border-t border-border pt-sm text-xs">
                {message.citations.map((citation) => (
                  <li key={`${citation.pageId}:${citation.revisionId}`}>
                    <a className="text-primary hover:underline" href={`/${citation.path}`}>{citation.title}</a>
                  </li>
                ))}
              </ul>
            ) : null}
          </article>
        ))}
      </div>
      <form
        className="space-y-sm border-t border-border p-md"
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
