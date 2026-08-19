'use client';

import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { I18nProvider } from '@/i18n/client';
import { useIslandMessages } from '@/i18n/message-store';
import { ThemeProvider } from '@/components/theme/ThemeProvider';
import { CodeBlock } from './CodeBlock';
import { MermaidBlock } from './MermaidBlock';
import { MathPlotLayer } from './MathPlotLayer';
import { defaultLocale, type Locale, isLocale } from '@/i18n/config';

function getLocaleFromDocument(): Locale {
  const lang = document.documentElement.lang;
  if (isLocale(lang)) return lang;
  return defaultLocale;
}

type Island =
  | { kind: 'code'; element: HTMLElement; source: string; rawHtmlProp: { __html: string } }
  | { kind: 'mermaid'; element: HTMLElement; source: string };

export const ContentRenderer = memo(function ContentRenderer({ html }: { html: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [islands, setIslands] = useState<Island[]>([]);
  const [locale, setLocale] = useState<Locale>(() =>
    typeof document === 'undefined' ? defaultLocale : getLocaleFromDocument(),
  );
  const catalog = useIslandMessages(locale);

  // Stable object identity across re-renders (e.g. a locale switch): a fresh
  // `{ __html }` literal on every render makes React re-apply innerHTML even
  // when the string is unchanged, which tears down and recreates the whole
  // subtree — orphaning the DOM nodes the effect below hands off as portal
  // targets, so the code/mermaid islands would silently fail to mount.
  const htmlProp = useMemo(() => ({ __html: html }), [html]);

  useEffect(() => {
    const observer = new MutationObserver(() => setLocale(getLocaleFromDocument()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
    return () => observer.disconnect();
  }, []);

  // Re-scans only when `html` replaces the DOM subtree; locale changes flow
  // through the shared I18nProvider below without touching this list, so a
  // language switch never re-renders 80+ independent islands at once.
  useEffect(() => {
    if (!containerRef.current) return;

    const found: Island[] = [];

    containerRef.current.querySelectorAll('[data-code-block]').forEach((el) => {
      const element = el as HTMLElement;
      const pre = element.querySelector('pre');
      if (!pre) return;
      found.push({ kind: 'code', element, source: pre.textContent ?? '', rawHtmlProp: { __html: pre.outerHTML } });
    });

    containerRef.current.querySelectorAll('[data-mermaid-block]').forEach((el) => {
      const element = el as HTMLElement;
      const pre = element.querySelector('pre');
      if (!pre) return;
      found.push({ kind: 'mermaid', element, source: pre.textContent ?? '' });
    });

    setIslands(found);
  }, [html]);

  return (
    <div ref={containerRef}>
      <div className="prose max-w-none" dangerouslySetInnerHTML={htmlProp} />
      <MathPlotLayer containerRef={containerRef} html={html} locale={locale} />
      <I18nProvider initialLocale={locale} messages={catalog}>
        <ThemeProvider>
          {islands.map((island, index) =>
            createPortal(
              island.kind === 'code' ? (
                <CodeBlock source={island.source}>
                  <div dangerouslySetInnerHTML={island.rawHtmlProp} />
                </CodeBlock>
              ) : (
                <MermaidBlock source={island.source} key={island.source} />
              ),
              island.element,
              String(index),
            ),
          )}
        </ThemeProvider>
      </I18nProvider>
    </div>
  );
});
