'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { mermaidThemeVariables } from './mermaid-theme';

export function MermaidRenderer({ children }: { children: ReactNode }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const nodes = containerRef.current?.querySelectorAll('.mermaid');
    if (!nodes || nodes.length === 0) return;

    let cancelled = false;

    import('mermaid').then((mermaidModule) => {
      if (cancelled) return;
      const mermaid = mermaidModule.default;
      mermaid.initialize({
        startOnLoad: false,
        theme: 'default',
        themeVariables: mermaidThemeVariables(),
      });
      void mermaid.run({ nodes: Array.from(nodes) as HTMLElement[] });
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return <div ref={containerRef}>{children}</div>;
}
