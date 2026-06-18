'use client';

import { useEffect, useRef, type ReactNode } from 'react';

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
        themeVariables: {
          fontFamily: 'var(--font-body)',
          primaryColor: '#e7e5e4',
          primaryTextColor: '#292524',
          primaryBorderColor: '#a8a29e',
          lineColor: '#57534e',
          secondaryColor: '#f5f5f4',
          tertiaryColor: '#fafaf9',
        },
      });
      void mermaid.run({ nodes: Array.from(nodes) as HTMLElement[] });
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return <div ref={containerRef}>{children}</div>;
}
