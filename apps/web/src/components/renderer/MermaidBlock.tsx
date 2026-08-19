'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { CodeBlock } from './CodeBlock';
import { MermaidZoomModal } from './MermaidZoomModal';
import { ExpandIcon } from '@/components/icons';
import { mermaidThemeVariables } from './mermaid-theme';
import { useTranslation } from '@/i18n/client';
import { useTheme } from '@/components/theme/ThemeProvider';

export function MermaidBlock({ source }: { source: string }) {
  const { t } = useTranslation();
  const { resolved } = useTheme();
  const [mode, setMode] = useState<'diagram' | 'code'>('diagram');
  const [zoomOpen, setZoomOpen] = useState(false);
  const [svg, setSvg] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  // jsdom (tests) has no IntersectionObserver; treat that as "always
  // visible" so environments without it keep the previous, non-lazy
  // behavior instead of never rendering.
  const [visible, setVisible] = useState(() => typeof IntersectionObserver === 'undefined');
  const baseId = useId().replace(/:/g, '_');
  const renderId = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // Defer rendering until the diagram is near the viewport. mermaid's
  // dagre-based auto-layout does synchronous DOM measurement (a classic
  // forced-reflow source), so a content page with several diagrams would
  // otherwise render all of them at once on load and block the main thread
  // for each.
  useEffect(() => {
    if (visible) return;
    const el = containerRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) setVisible(true);
      },
      { rootMargin: '200px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [visible]);

  useEffect(() => {
    if (mode !== 'diagram' || !visible) return;

    let cancelled = false;
    const id = `${baseId}-${renderId.current++}`;

    import('mermaid')
      .then((mermaidModule) => {
        if (cancelled) return;
        const mermaid = mermaidModule.default;
        mermaid.initialize({
          startOnLoad: false,
          theme: 'default',
          themeVariables: mermaidThemeVariables(),
        });
        return mermaid.render(id, source);
      })
      .then((result) => {
        if (!cancelled && result) {
          setFailed(false);
          setSvg(result.svg);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          console.error('[MermaidBlock] mermaid.render failed:', err);
          setFailed(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [mode, source, resolved, baseId, visible]);

  const codePanel = (
    <CodeBlock source={source}>
      <pre>
        <code>{source}</code>
      </pre>
    </CodeBlock>
  );

  return (
    <div className="my-md" ref={containerRef}>
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
        <div className="relative group">
          <button
            type="button"
            onClick={() => setZoomOpen(true)}
            aria-label={t('renderer.mermaid.expandButton')}
            title={t('renderer.mermaid.expandButton')}
            className="absolute top-2 right-2 inline-flex items-center justify-center w-7 h-7 rounded text-muted bg-surface border border-border hover:text-foreground hover:bg-surface-elevated transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100 z-10"
          >
            <ExpandIcon className="w-4 h-4" />
          </button>
          {failed ? (
            codePanel
          ) : svg ? (
            <div className="mermaid" dangerouslySetInnerHTML={{ __html: svg }} />
          ) : (
            <pre className="mermaid">{source}</pre>
          )}
          {zoomOpen && <MermaidZoomModal source={source} onClose={() => setZoomOpen(false)} />}
        </div>
      ) : (
        codePanel
      )}
    </div>
  );
}
