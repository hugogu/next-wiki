'use client';

import { useEffect, useRef, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { I18nProvider } from '@/i18n/client';
import { messages } from '@/i18n/catalog';
import { ThemeProvider } from '@/components/theme/ThemeProvider';
import { CodeBlock } from './CodeBlock';
import { MermaidBlock } from './MermaidBlock';
import { defaultLocale, type Locale, isLocale } from '@/i18n/config';

function getLocaleFromDocument(): Locale {
  const lang = document.documentElement.lang;
  if (isLocale(lang)) return lang;
  return defaultLocale;
}

export function ContentRenderer({ html }: { html: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const rootsRef = useRef(new Map<HTMLElement, Root>());
  const islandRef = useRef(new Map<HTMLElement, { source: string; rawHtml: string; kind: 'code' | 'mermaid' }>());
  const [locale, setLocale] = useState<Locale>(() =>
    typeof document === 'undefined' ? defaultLocale : getLocaleFromDocument(),
  );

  useEffect(() => {
    const observer = new MutationObserver(() => setLocale(getLocaleFromDocument()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;

    const activeElements = new Set<HTMLElement>();

    const renderCodeIsland = (el: HTMLElement, source: string, rawHtml: string) => {
      activeElements.add(el);
      islandRef.current.set(el, { source, rawHtml, kind: 'code' });
      const root = rootsRef.current.get(el) ?? createRoot(el);
      rootsRef.current.set(el, root);
      root.render(
        <I18nProvider initialLocale={locale} messages={messages[locale]}>
          <ThemeProvider>
            <CodeBlock source={source}>
              <div dangerouslySetInnerHTML={{ __html: rawHtml }} />
            </CodeBlock>
          </ThemeProvider>
        </I18nProvider>,
      );
    };

    const renderMermaidIsland = (el: HTMLElement, source: string, rawHtml: string) => {
      activeElements.add(el);
      islandRef.current.set(el, { source, rawHtml, kind: 'mermaid' });
      const root = rootsRef.current.get(el) ?? createRoot(el);
      rootsRef.current.set(el, root);
      root.render(
        <I18nProvider initialLocale={locale} messages={messages[locale]}>
          <ThemeProvider>
            <MermaidBlock source={source}>
              <div dangerouslySetInnerHTML={{ __html: rawHtml }} />
            </MermaidBlock>
          </ThemeProvider>
        </I18nProvider>,
      );
    };

    containerRef.current.querySelectorAll('[data-code-block]').forEach((el) => {
      const element = el as HTMLElement;
      const pre = element.querySelector('pre');
      if (!pre && !rootsRef.current.has(element)) return;
      renderCodeIsland(element, pre?.textContent ?? '', pre?.outerHTML ?? '');
    });

    containerRef.current.querySelectorAll('[data-mermaid-block]').forEach((el) => {
      const element = el as HTMLElement;
      const pre = element.querySelector('pre');
      if (!pre && !rootsRef.current.has(element)) return;
      renderMermaidIsland(element, pre?.textContent ?? '', pre?.outerHTML ?? '');
    });

    for (const [element, root] of rootsRef.current) {
      if (!activeElements.has(element) || !containerRef.current.contains(element)) {
        root.unmount();
        rootsRef.current.delete(element);
        islandRef.current.delete(element);
      }
    }
  }, [html, locale]);

  return (
    <div ref={containerRef}>
      <div className="prose max-w-none" dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}
