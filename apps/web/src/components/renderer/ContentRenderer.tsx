'use client';

import { useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { CodeBlock } from './CodeBlock';
import { MermaidBlock } from './MermaidBlock';

export function ContentRenderer({ html }: { html: string }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    containerRef.current.querySelectorAll('[data-code-block]').forEach((el) => {
      if ((el as HTMLElement).dataset.enhanced === 'true') return;
      (el as HTMLElement).dataset.enhanced = 'true';

      const pre = el.querySelector('pre');
      if (!pre) return;

      const source = pre.textContent ?? '';
      const wrapper = document.createElement('div');
      el.replaceChildren(wrapper);
      createRoot(wrapper).render(
        <CodeBlock source={source}>
          <div dangerouslySetInnerHTML={{ __html: pre.outerHTML }} />
        </CodeBlock>,
      );
    });

    containerRef.current.querySelectorAll('[data-mermaid-block]').forEach((el) => {
      if ((el as HTMLElement).dataset.enhanced === 'true') return;
      (el as HTMLElement).dataset.enhanced = 'true';

      const mermaidEl = el.querySelector('.mermaid');
      if (!mermaidEl) return;

      const source = mermaidEl.textContent ?? '';
      const wrapper = document.createElement('div');
      el.replaceChildren(wrapper);
      createRoot(wrapper).render(
        <MermaidBlock source={source}>
          <div className="mermaid">{source}</div>
        </MermaidBlock>,
      );
    });
  }, [html]);

  return (
    <div ref={containerRef}>
      <div className="prose max-w-none" dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}
