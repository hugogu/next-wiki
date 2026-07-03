'use client';

import { useState } from 'react';
import { useTranslation } from '@/i18n/client';
import { ChevronDownIcon, ChevronRightIcon, SparklesIcon } from '@/components/icons';

function stripTags(text: string): string {
  return text.replace(/<\/?think>/g, '').trim();
}

export function ChatThinking({ thinking, streaming }: { thinking: string; streaming?: boolean }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(streaming ?? false);
  const content = stripTags(thinking);
  if (!content) return null;
  return (
    <div className="mb-sm rounded-md border border-border bg-background">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center gap-xs px-sm py-xs text-xs text-muted hover:text-primary"
        aria-expanded={open}
      >
        {open ? <ChevronDownIcon className="h-3.5 w-3.5" /> : <ChevronRightIcon className="h-3.5 w-3.5" />}
        <SparklesIcon className="h-3.5 w-3.5" />
        <span className="flex-1 text-left">{streaming ? t('ai.chat.thinking') : t('ai.chat.showThinking')}</span>
      </button>
      {open && (
        <div className="max-h-48 overflow-auto border-t border-border px-sm py-xs text-xs text-muted">
          <div className="whitespace-pre-wrap">{content}</div>
        </div>
      )}
    </div>
  );
}
