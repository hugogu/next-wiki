'use client';

import { useState, useEffect, useRef } from 'react';
import { CodeBlock } from './CodeBlock';
import { useTranslation } from '@/i18n/client';

export function MermaidBlock({ children, source }: { children: React.ReactNode; source: string }) {
  const { t } = useTranslation();
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
    <div className="my-md">
      <div className="flex items-center justify-end gap-xs mb-xs">
        <button
          type="button"
          onClick={() => setMode('diagram')}
          className={`px-2 py-1 text-xs rounded transition-colors ${
            mode === 'diagram'
              ? 'bg-primary text-primary-text'
              : 'text-muted hover:text-foreground hover:bg-surface-elevated'
          }`}
        >
          {t('renderer.mermaid.diagramButton')}
        </button>
        <button
          type="button"
          onClick={() => setMode('code')}
          className={`px-2 py-1 text-xs rounded transition-colors ${
            mode === 'code'
              ? 'bg-primary text-primary-text'
              : 'text-muted hover:text-foreground hover:bg-surface-elevated'
          }`}
        >
          {t('renderer.mermaid.codeButton')}
        </button>
      </div>

      {mode === 'diagram' ? (
        <div ref={containerRef}>{children}</div>
      ) : (
        <CodeBlock source={source}>
          <div className="prose max-w-none" dangerouslySetInnerHTML={{ __html: `\u003cpre\u003e\u003ccode\u003e${source}\u003c/code\u003e\u003c/pre\u003e` }} />
        </CodeBlock>
      )}
    </div>
  );
}
