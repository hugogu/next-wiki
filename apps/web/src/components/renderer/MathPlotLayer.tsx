'use client';

import { useEffect, useState, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { I18nProvider, useTranslation } from '@/i18n/client';
import { messages } from '@/i18n/catalog';
import { ThemeProvider } from '@/components/theme/ThemeProvider';
import { ModalDialog } from '@/components/ui/ModalDialog';
import { FunctionPlotIcon } from '@/components/icons';
import type { Locale } from '@/i18n/config';
import { FunctionPlot } from './FunctionPlot';
import { parsePlottableTex } from './tex-to-plot';

const GROUP_CLASS = 'fx-plot-group';
const MOUNT_CLASS = 'fx-plot-mount';

interface PlotTarget {
  mount: HTMLElement;
  expr: string;
  tex: string;
}

/**
 * Decorate every plottable KaTeX formula inside `containerRef` with a hover
 * icon that opens its function graph in a modal. The rendered HTML already
 * contains KaTeX output with a MathML `<annotation>` carrying the original TeX;
 * we read that, decide whether it is a single-variable function, and — only
 * then — wrap the formula so a button can sit beside it.
 */
export function MathPlotLayer({
  containerRef,
  html,
  locale,
}: {
  containerRef: RefObject<HTMLDivElement | null>;
  html: string;
  locale: Locale;
}) {
  const [targets, setTargets] = useState<PlotTarget[]>([]);
  const [active, setActive] = useState<number | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    setActive(null);

    const found: PlotTarget[] = [];
    container.querySelectorAll<HTMLElement>('.katex').forEach((node) => {
      if (node.closest(`.${GROUP_CLASS}`)) return; // already decorated
      const tex = node
        .querySelector('annotation[encoding="application/x-tex"]')
        ?.textContent?.trim();
      if (!tex) return;
      const parsed = parsePlottableTex(tex);
      if (!parsed) return;

      const group = document.createElement('span');
      group.className = GROUP_CLASS;
      node.parentNode?.insertBefore(group, node);
      group.appendChild(node);
      const mount = document.createElement('span');
      mount.className = MOUNT_CLASS;
      group.appendChild(mount);

      found.push({ mount, expr: parsed.expr, tex });
    });

    setTargets(found);

    return () => {
      // Restore the original DOM so a re-render (new `html`) starts clean.
      found.forEach(({ mount }) => {
        const group = mount.parentElement;
        const katex = group?.querySelector('.katex');
        if (group?.parentNode && katex) {
          group.parentNode.insertBefore(katex, group);
          group.remove();
        }
      });
    };
  }, [containerRef, html]);

  const catalog = messages[locale] ?? messages.en;

  return (
    <I18nProvider initialLocale={locale} messages={catalog}>
      <ThemeProvider>
        {targets.map((target, index) =>
          createPortal(<PlotButton onClick={() => setActive(index)} />, target.mount, String(index)),
        )}
        {active !== null && targets[active] && (
          <PlotModal target={targets[active]} onClose={() => setActive(null)} />
        )}
      </ThemeProvider>
    </I18nProvider>
  );
}

function PlotButton({ onClick }: { onClick: () => void }) {
  const { t } = useTranslation();
  const label = t('renderer.plot.button');
  return (
    <button type="button" className="fx-plot-btn" onClick={onClick} aria-label={label} title={label}>
      <FunctionPlotIcon width={14} height={14} />
    </button>
  );
}

function PlotModal({ target, onClose }: { target: PlotTarget; onClose: () => void }) {
  const { t } = useTranslation();
  return (
    <ModalDialog
      title={t('renderer.plot.title')}
      description={t('renderer.plot.description')}
      onClose={onClose}
    >
      <FunctionPlot expr={target.expr} />
    </ModalDialog>
  );
}
