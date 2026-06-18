'use client';

import { useState, useEffect, useRef } from 'react';
import { CodeBlock } from './CodeBlock';

export function MermaidBlock({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<'diagram' | 'code'>('diagram');
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (mode !== 'diagram') return;
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
  }, [mode]);

  return (
    <div className="my-md border border-border rounded-md overflow-hidden bg-surface">
      <div className="flex items-center justify-between px-sm py-xs border-b border-border bg-surface-elevated">
        <span className="text-xs text-muted font-medium">mermaid</span>
        <div className="flex items-center gap-xs">
          <button
            type="button"
            onClick={() => setMode('diagram')}
            className={`px-2 py-1 text-xs rounded transition-colors ${
              mode === 'diagram'
                ? 'bg-primary text-primary-text'
                : 'text-muted hover:text-foreground hover:bg-surface'
            }`}
          >
            Diagram
          </button>
          <button
            type="button"
            onClick={() => setMode('code')}
            className={`px-2 py-1 text-xs rounded transition-colors ${
              mode === 'code'
                ? 'bg-primary text-primary-text'
                : 'text-muted hover:text-foreground hover:bg-surface'
            }`}
          >
            Code
          </button>
        </div>
      </div>

      {mode === 'diagram' ? (
        <div ref={containerRef} className="p-md">{children}</div>
      ) : (
        <div className="p-md">
          <CodeBlock>{children}</CodeBlock>
        </div>
      )}
    </div>
  );
}
