'use client';

import { useEffect, useState } from 'react';
import { apiPost } from '@/lib/api/client';
import { ContentRenderer } from '@/components/renderer/ContentRenderer';

/**
 * Renders an assistant answer. While the answer is still streaming we show raw
 * text to avoid flicker from half-written Markdown; once complete we run it
 * through the same `/api/preview` pipeline as wiki pages and render the result
 * with the shared ContentRenderer so code blocks, tables and Mermaid work.
 */
export function ChatAnswer({ text, done }: { text: string; done: boolean }) {
  // Keyed by the text it was rendered from, so stale HTML is never shown when
  // the answer changes (e.g. a retry reusing the same component instance).
  const [rendered, setRendered] = useState<{ text: string; html: string } | null>(null);

  useEffect(() => {
    if (!done || !text.trim()) return;
    let cancelled = false;
    apiPost<{ contentSource: string }, { html: string }>('/api/preview', { contentSource: text })
      .then((result) => {
        if (!cancelled) setRendered({ text, html: result.html });
      })
      .catch(() => {
        // Fall back to plain text rendering on preview failure.
      });
    return () => {
      cancelled = true;
    };
  }, [text, done]);

  if (done && rendered?.text === text) return <ContentRenderer html={rendered.html} />;
  return <div className="whitespace-pre-wrap">{text}</div>;
}
