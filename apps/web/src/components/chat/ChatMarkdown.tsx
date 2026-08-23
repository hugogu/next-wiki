'use client';

import { useEffect, useState } from 'react';
import { apiPost } from '@/lib/api/client';
import { ContentRenderer } from '@/components/renderer/ContentRenderer';

/**
 * Renders a chunk of assistant-authored Markdown (an answer, or the model's
 * reasoning) the same way a wiki page is rendered: while it is still streaming
 * we show raw text to avoid flicker from half-written Markdown; once complete
 * we run it through the `/api/preview` pipeline and hand the HTML to the shared
 * ContentRenderer so code blocks, tables and Mermaid work.
 *
 * `done` doubles as a gate: a caller that keeps collapsed Markdown mounted can
 * pass `false` to skip the round trip until the reader actually opens it.
 */
export function ChatMarkdown({ source, done }: { source: string; done: boolean }) {
  // Keyed by the source it was rendered from, so stale HTML is never shown when
  // the text changes (e.g. a retry reusing the same component instance).
  const [rendered, setRendered] = useState<{ source: string; html: string } | null>(null);

  useEffect(() => {
    if (!done || !source.trim()) return;
    let cancelled = false;
    apiPost<{ contentSource: string }, { html: string }>('/api/preview', { contentSource: source })
      .then((result) => {
        if (!cancelled) setRendered({ source, html: result.html });
      })
      .catch(() => {
        // Fall back to plain text rendering on preview failure.
      });
    return () => {
      cancelled = true;
    };
  }, [source, done]);

  if (done && rendered?.source === source) return <ContentRenderer html={rendered.html} />;
  return <div className="whitespace-pre-wrap">{source}</div>;
}
