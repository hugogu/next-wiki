'use client';

import { useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { I18nProvider } from '@/i18n/client';
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

  useEffect(() => {
    if (!containerRef.current) return;

    const locale = getLocaleFromDocument();

    containerRef.current.querySelectorAll('[data-code-block]').forEach((el) => {
      if ((el as HTMLElement).dataset.enhanced === 'true') return;
      (el as HTMLElement).dataset.enhanced = 'true';

      const pre = el.querySelector('pre');
      if (!pre) return;

      const source = pre.textContent ?? '';
      const wrapper = document.createElement('div');
      el.replaceChildren(wrapper);
      createRoot(wrapper).render(
        <I18nProvider initialLocale={locale}>
          <ThemeProvider>
            <CodeBlock source={source}>
              <div dangerouslySetInnerHTML={{ __html: pre.outerHTML }} />
            </CodeBlock>
          </ThemeProvider>
        </I18nProvider>,
      );
    });

    containerRef.current.querySelectorAll('[data-mermaid-block]').forEach((el) => {
      if ((el as HTMLElement).dataset.enhanced === 'true') return;
      (el as HTMLElement).dataset.enhanced = 'true';

      const pre = el.querySelector('pre');
      if (!pre) return;

      const source = pre.textContent ?? '';
      const wrapper = document.createElement('div');
      el.replaceChildren(wrapper);
      createRoot(wrapper).render(
        <I18nProvider initialLocale={locale}>
          <ThemeProvider>
            <MermaidBlock source={source}>
              <div dangerouslySetInnerHTML={{ __html: pre.outerHTML }} />
            </MermaidBlock>
          </ThemeProvider>
        </I18nProvider>,
      );
    });
  }, [html]);

  return (
    <div ref={containerRef}>
      <div className="prose max-w-none" dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}
