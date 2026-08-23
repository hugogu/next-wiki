'use client';

import { useState } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from '@/i18n/client';
import { ChevronDownIcon, ChevronRightIcon, SparklesIcon } from '@/components/icons';
import { ChatMarkdown } from './ChatMarkdown';

function stripTags(text: string): string {
  return text.replace(/<\/?think>/g, '').trim();
}

export function ChatThinking({
  thinking = '',
  streaming,
  children,
}: {
  thinking?: string;
  streaming?: boolean;
  children?: ReactNode;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(streaming ?? false);
  const content = stripTags(thinking);
  if (!content && !children) return null;
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
        <span className="flex-1 text-left">
          {streaming ? t('ai.chat.thinking') : open ? t('ai.chat.hideThinking') : t('ai.chat.showThinking')}
        </span>
      </button>
      <div hidden={!open} className="max-h-64 overflow-auto border-t border-border text-xs text-muted">
        {/* Models write their reasoning in Markdown too. Render it once the
            panel is open and the stream has settled; a collapsed block stays
            raw so a long history does not fire a preview request per turn. */}
        {content && (
          <div className="prose-compact px-sm py-xs">
            <ChatMarkdown source={content} done={open && !streaming} />
          </div>
        )}
        {children && <div className={content ? 'border-t border-border' : ''}>{children}</div>}
      </div>
    </div>
  );
}
