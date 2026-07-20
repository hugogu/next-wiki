'use client';

import { useEffect, useRef, useState } from 'react';
import type { SVGProps } from 'react';
import {
  TransformWrapper,
  TransformComponent,
  useControls,
} from 'react-zoom-pan-pinch';
import { ModalDialog } from '@/components/ui/ModalDialog';
import { PlusIcon } from '@/components/icons';
import { CodeBlock } from './CodeBlock';
import { mermaidThemeVariables } from './mermaid-theme';
import { useTranslation } from '@/i18n/client';

/**
 * Renders mermaid `source` inside a TransformWrapper so the user can zoom
 * (wheel / buttons / double-click) and pan (drag) a large diagram. Falls back
 * to a CodeBlock showing the raw source if mermaid fails to render.
 *
 * Important layout note: `ZoomControls` (which calls `useControls()`) MUST be
 * rendered as a child of `TransformWrapper` - the hook reads context provided
 * by the wrapper. The toolbar and pannable canvas live inside the same
 * bordered box, laid out as a flex column so the canvas fills the remaining
 * height without any hardcoded pixel offset.
 */
export function MermaidZoomModal({
  source,
  onClose,
}: {
  source: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (failed) return;
    const nodes = containerRef.current?.querySelectorAll('.mermaid');
    if (!nodes || nodes.length === 0) return;

    let cancelled = false;
    import('mermaid')
      .then((mermaidModule) => {
        if (cancelled) return;
        const mermaid = mermaidModule.default;
        mermaid.initialize({
          startOnLoad: false,
          theme: 'default',
          themeVariables: mermaidThemeVariables(),
        });
        return mermaid.run({ nodes: Array.from(nodes) as HTMLElement[] });
      })
      .then(() => {
        if (cancelled) return;
        // mermaid.run replaces the <pre> with an <svg>; if no svg appeared, treat as failure.
        const svg = containerRef.current?.querySelector('svg');
        if (!svg) setFailed(true);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        console.error('[MermaidZoomModal] mermaid.run failed:', err);
        setFailed(true);
      });

    return () => {
      cancelled = true;
    };
  }, [failed]);

  return (
    <ModalDialog
      title={t('renderer.mermaid.modalTitle')}
      description={t('renderer.mermaid.modalDescription')}
      onClose={onClose}
      maxWidth="max-w-6xl"
    >
      {failed ? (
        <CodeBlock source={source}>
          <pre>
            <code>{source}</code>
          </pre>
        </CodeBlock>
      ) : (
        <div className="h-[75vh] w-full overflow-hidden rounded border border-border bg-surface">
          <TransformWrapper
            minScale={0.2}
            maxScale={4}
            centerOnInit
            limitToBounds={false}
            doubleClick={{ mode: 'zoomIn', step: 0.7 }}
          >
            <div className="flex h-full flex-col">
              <div className="flex shrink-0 items-center gap-xs border-b border-border bg-surface-elevated p-sm">
                <ZoomControls />
              </div>
              <div className="min-h-0 flex-1">
                <TransformComponent
                  wrapperStyle={{ width: '100%', height: '100%' }}
                  contentStyle={{ width: '100%', height: '100%' }}
                >
                  <div
                    ref={containerRef}
                    className="flex items-center justify-center p-lg"
                  >
                    <pre className="mermaid">{source}</pre>
                  </div>
                </TransformComponent>
              </div>
            </div>
          </TransformWrapper>
        </div>
      )}
    </ModalDialog>
  );
}

function ZoomControls() {
  const { t } = useTranslation();
  const { zoomIn, zoomOut, resetTransform } = useControls();
  const btn =
    'inline-flex h-8 w-8 items-center justify-center rounded border border-border bg-surface text-muted hover:text-foreground hover:bg-surface-elevated transition-colors';

  return (
    <div className="flex items-center gap-xs">
      <button
        type="button"
        className={btn}
        onClick={() => zoomIn()}
        aria-label={t('renderer.mermaid.zoomIn')}
        title={t('renderer.mermaid.zoomIn')}
      >
        <PlusIcon className="h-4 w-4" />
      </button>
      <button
        type="button"
        className={btn}
        onClick={() => zoomOut()}
        aria-label={t('renderer.mermaid.zoomOut')}
        title={t('renderer.mermaid.zoomOut')}
      >
        <MinusIcon className="h-4 w-4" />
      </button>
      <button
        type="button"
        className={`${btn} h-8 w-auto px-2 text-xs`}
        onClick={() => resetTransform()}
        aria-label={t('renderer.mermaid.reset')}
        title={t('renderer.mermaid.reset')}
      >
        {t('renderer.mermaid.reset')}
      </button>
    </div>
  );
}

// Minimal inline icon for zoom-out; the shared icon set doesn't export a
// MinusIcon, and adding one just for this toolbar would be over-scope.
// Matches the shared `Icon` wrapper's style (24x24 viewBox, 2px stroke,
// rounded caps) at 16px display size.
function MinusIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M5 12h14" />
    </svg>
  );
}
