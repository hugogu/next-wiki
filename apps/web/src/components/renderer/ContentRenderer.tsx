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

      const wrapper = document.createElement('div');
      el.appendChild(wrapper);
      createRoot(wrapper).render(
        <CodeBlock>
          <div dangerouslySetInnerHTML={{ __html: pre.outerHTML }} />
        </CodeBlock>,
      );
    });

    containerRef.current.querySelectorAll('[data-mermaid-block]').forEach((el) => {
      if ((el as HTMLElement).dataset.enhanced === 'true') return;
      (el as HTMLElement).dataset.enhanced = 'true';

      const pre = el.querySelector('pre');
      if (!pre) return;

      const wrapper = document.createElement('div');
      el.appendChild(wrapper);
      createRoot(wrapper).render(
        <MermaidBlock>
          <div dangerouslySetInnerHTML={{ __html: pre.outerHTML }} />
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
