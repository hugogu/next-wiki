'use client';

import { useState, useEffect, useRef } from 'react';
import { CodeBlock } from './CodeBlock';
import { MermaidZoomModal } from './MermaidZoomModal';
import { ExpandIcon } from '@/components/icons';
import { mermaidThemeVariables } from './mermaid-theme';
import { useTranslation } from '@/i18n/client';

export function MermaidBlock({ children, source }: { children: React.ReactNode; source: string }) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<'diagram' | 'code'>('diagram');
  const [zoomOpen, setZoomOpen] = useState(false);
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
        themeVariables: mermaidThemeVariables(),
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
        <div className="relative group" data-mermaid-canvas="">
          <button
            type="button"
            onClick={() => setZoomOpen(true)}
            aria-label={t('renderer.mermaid.expandButton')}
            title={t('renderer.mermaid.expandButton')}
            className="absolute top-2 right-2 inline-flex items-center justify-center w-7 h-7 rounded text-muted bg-surface border border-border hover:text-foreground hover:bg-surface-elevated transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100 z-10"
          >
            <ExpandIcon className="w-4 h-4" />
          </button>
          <div ref={containerRef}>{children}</div>
        </div>
      ) : (
        <CodeBlock source={source}>
          <div className="prose max-w-none" dangerouslySetInnerHTML={{ __html: `\u003cpre\u003e\u003ccode\u003e${source}\u003c/code\u003e\u003c/pre\u003e` }} />
        </CodeBlock>
      )}

      {zoomOpen && <MermaidZoomModal source={source} onClose={() => setZoomOpen(false)} />}
    </div>
  );
}
