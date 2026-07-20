'use client';

import { useEffect, useRef, useState } from 'react';
import type { FunctionPlotOptions } from 'function-plot';
import { useTranslation } from '@/i18n/client';

/**
 * Render a plottable expression as an interactive graph. A `function` plot is
 * an explicit `y = f(x)` curve; an `implicit` plot is the boundary curve of an
 * x–y relation (e.g. a circle). function-plot pulls in d3, so it is loaded
 * lazily on first open rather than shipped with every content page.
 */
export function FunctionPlot({
  expr,
  kind = 'function',
}: {
  expr: string;
  kind?: 'function' | 'implicit';
}) {
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
        const height = Math.round(width * 0.62);
        const accent =
          getComputedStyle(document.documentElement).getPropertyValue('--color-primary').trim() ||
          '#2563eb';
        host.innerHTML = '';

        const options: FunctionPlotOptions = {
          target: host,
          width,
          height,
          grid: true,
          data: [
            kind === 'implicit'
              ? { fn: expr, fnType: 'implicit', color: accent }
              : { fn: expr, graphType: 'polyline', sampler: 'builtIn', color: accent },
          ],
        };
        if (kind === 'implicit') {
          // Give conics a square-ish, symmetric window so a unit circle reads
          // as a circle rather than a wide ellipse (aspect matches width:height).
          const half = 3;
          options.xAxis = { domain: [-half, half] };
          options.yAxis = { domain: [-half * (height / width), half * (height / width)] };
        }

        functionPlot(options);
      })
      .catch(() => {
        if (!disposed) setFailed(true);
      });

    return () => {
      disposed = true;
      if (el) el.innerHTML = '';
    };
  }, [expr, kind]);

  return (
    <div>
      {failed && <p className="mb-sm text-sm text-danger">{t('renderer.plot.error')}</p>}
      <div ref={containerRef} className="fx-plot-canvas w-full overflow-x-auto" />
      <p className="mt-sm text-center font-mono text-xs text-muted">
        {kind === 'implicit' ? `${expr} = 0` : `y = ${expr}`}
      </p>
    </div>
  );
}
