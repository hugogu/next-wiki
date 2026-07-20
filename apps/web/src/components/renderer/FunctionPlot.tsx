'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslation } from '@/i18n/client';

/**
 * Render a single-variable expression (already normalized to use `x`) as an
 * interactive plot. function-plot pulls in d3, so it is loaded lazily on first
 * open rather than shipped with every content page.
 */
export function FunctionPlot({ expr }: { expr: string }) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let disposed = false;
    setFailed(false);

    import('function-plot')
      .then(({ default: functionPlot }) => {
        if (disposed || !containerRef.current) return;
        const host = containerRef.current;
        const width = host.clientWidth || 600;
        const accent =
          getComputedStyle(document.documentElement).getPropertyValue('--color-primary').trim() ||
          '#2563eb';
        host.innerHTML = '';
        functionPlot({
          target: host,
          width,
          height: Math.round(width * 0.62),
          grid: true,
          data: [{ fn: expr, graphType: 'polyline', sampler: 'builtIn', color: accent }],
        });
      })
      .catch(() => {
        if (!disposed) setFailed(true);
      });

    return () => {
      disposed = true;
      if (el) el.innerHTML = '';
    };
  }, [expr]);

  return (
    <div>
      {failed && <p className="mb-sm text-sm text-danger">{t('renderer.plot.error')}</p>}
      <div ref={containerRef} className="fx-plot-canvas w-full overflow-x-auto" />
      <p className="mt-sm text-center font-mono text-xs text-muted">y = {expr}</p>
    </div>
  );
}
