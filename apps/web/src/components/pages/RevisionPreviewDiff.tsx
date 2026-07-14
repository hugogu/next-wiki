'use client';

import { useEffect, useRef } from 'react';
import { ContentRenderer } from '@/components/renderer/ContentRenderer';
import { buildDiffRows, changedLineNumbers, withContext, type DiffRow } from '@/lib/revision-diff';

function lineNumbers(rows: DiffRow[]): { left: Set<number>; right: Set<number> } {
  const left = new Set<number>();
  const right = new Set<number>();
  rows.forEach((row) => {
    if (row.kind === 'collapsed') return;
    if (row.left) left.add(row.left.number);
    if (row.right) right.add(row.right.number);
  });
  return { left, right };
}

function PreviewPane({
  html,
  lines,
  visibleLines,
  label,
  paneRef,
}: {
  html: string;
  lines: Set<number>;
  visibleLines: Set<number>;
  label: string;
  paneRef: React.RefObject<HTMLDivElement | null>;
}) {
  useEffect(() => {
    paneRef.current?.querySelectorAll<HTMLElement>('[data-line]').forEach((element) => {
      const changed = lines.has(Number(element.dataset.line));
      element.classList.toggle('bg-primary/10', changed);
      element.classList.toggle('ring-1', changed);
      element.classList.toggle('ring-primary/40', changed);
      element.classList.toggle(
        'hidden',
        !visibleLines.has(Number(element.dataset.line)) && !element.querySelector('[data-line]'),
      );
    });
  }, [lines, paneRef, visibleLines]);

  return (
    <div
      ref={paneRef}
      className="max-h-[70vh] overflow-auto rounded-lg border border-border p-md"
      aria-label={label}
    >
      <ContentRenderer html={html} />
    </div>
  );
}

export function RevisionPreviewDiff({
  before,
  after,
  beforeHtml,
  afterHtml,
  context,
  ignoreWhitespace,
  sync,
}: {
  before: string;
  after: string;
  beforeHtml: string;
  afterHtml: string;
  context: number | 'full';
  ignoreWhitespace: boolean;
  sync: boolean;
}) {
  const leftRef = useRef<HTMLDivElement>(null);
  const rightRef = useRef<HTMLDivElement>(null);
  const echo = useRef<'left' | 'right' | null>(null);
  const rows = withContext(buildDiffRows(before, after, ignoreWhitespace), context);
  const changedLines = changedLineNumbers(rows);
  const visibleLines = lineNumbers(rows);

  useEffect(() => {
    const left = leftRef.current;
    const right = rightRef.current;
    if (!left || !right) return;

    const link = (from: HTMLDivElement, to: HTMLDivElement, side: 'left' | 'right') => () => {
      if (!sync || echo.current === side) {
        echo.current = null;
        return;
      }
      echo.current = side === 'left' ? 'right' : 'left';
      to.scrollTop = from.scrollTop;
    };
    const onLeft = link(left, right, 'left');
    const onRight = link(right, left, 'right');
    left.addEventListener('scroll', onLeft);
    right.addEventListener('scroll', onRight);
    return () => {
      left.removeEventListener('scroll', onLeft);
      right.removeEventListener('scroll', onRight);
    };
  }, [sync]);

  return (
    <div className="grid min-h-0 grid-cols-1 gap-sm lg:grid-cols-2">
      <PreviewPane
        html={beforeHtml}
        lines={changedLines.left}
        visibleLines={visibleLines.left}
        label="Earlier revision preview"
        paneRef={leftRef}
      />
      <PreviewPane
        html={afterHtml}
        lines={changedLines.right}
        visibleLines={visibleLines.right}
        label="Later revision preview"
        paneRef={rightRef}
      />
    </div>
  );
}
