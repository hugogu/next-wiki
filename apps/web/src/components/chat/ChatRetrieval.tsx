'use client';

import type { ChatRetrievalResult } from '@/components/chat/chat-store';
import { useTranslation } from '@/i18n/client';
import { getCitationHref } from '@/lib/path';

/**
 * Baseline retrieval summary shown inside the thinking collapsible while the
 * model prepares its answer: how many pages the semantic search found, with
 * their titles expandable. Rendering it here turns the otherwise silent
 * pre-first-token wait into a visible phase.
 */
export function ChatRetrieval({ results }: { results?: ChatRetrievalResult[] }) {
  const { t } = useTranslation();
  if (!results?.length) return null;
  return (
    <details className="group min-w-0 max-w-full overflow-hidden">
      <summary className="flex min-h-8 min-w-0 cursor-pointer list-none items-center gap-xs px-sm py-xs marker:hidden">
        <span className="text-muted transition-transform group-open:rotate-90">&gt;</span>
        <span className="shrink-0 font-medium">{t('ai.chat.retrievedPages', { count: results.length })}</span>
      </summary>
      <ul className="min-w-0 space-y-xxs border-t border-border p-xs">
        {results.map((result) => (
          <li key={`${result.spaceSlug ?? 'wiki'}:${result.path}`} className="truncate">
            <a className="text-primary hover:underline" href={getCitationHref(result)}>
              {result.title}
            </a>
          </li>
        ))}
      </ul>
    </details>
  );
}
