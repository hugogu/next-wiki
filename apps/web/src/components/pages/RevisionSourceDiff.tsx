'use client';

import { useEffect, useMemo, useRef } from 'react';
import { buildDiffRows, withContext, type DiffRow } from '@/lib/revision-diff';

function Cell({ line, kind }: { line?: { number: number; text: string }; kind: string }) {
  const changeStyle =
    kind === 'added'
      ? {
          backgroundColor: 'color-mix(in srgb, var(--color-primary) 18%, transparent)',
          borderLeftColor: 'var(--color-primary)',
        }
      : kind === 'removed'
        ? {
            backgroundColor: 'color-mix(in srgb, var(--color-danger) 18%, transparent)',
            borderLeftColor: 'var(--color-danger)',
          }
        : kind === 'changed'
          ? {
              backgroundColor: 'color-mix(in srgb, var(--color-warning) 22%, transparent)',
              borderLeftColor: 'var(--color-warning)',
            }
          : undefined;
  return (
    <div
      className="grid grid-cols-[3rem_minmax(0,1fr)] border-l-4 border-transparent font-mono text-sm"
      data-diff-kind={kind === 'unchanged' ? undefined : kind}
      style={changeStyle}
    >
      <span className="select-none border-r border-border bg-surface-elevated px-xs py-1 text-right text-muted">
        {line?.number ?? ''}
      </span>
      <code className="min-w-0 whitespace-pre-wrap break-words px-sm py-1">{line?.text ?? ''}</code>
    </div>
  );
}

export function RevisionSourceDiff({
  before,
  after,
  context,
  ignoreWhitespace,
  sync,
}: {
  before: string;
  after: string;
  context: number | 'full';
  ignoreWhitespace: boolean;
  sync: boolean;
}) {
  const leftRef = useRef<HTMLDivElement>(null);
  const rightRef = useRef<HTMLDivElement>(null);
  const echo = useRef<'left' | 'right' | null>(null);
  const rows = useMemo(
    () => withContext(buildDiffRows(before, after, ignoreWhitespace), context),
    [before, after, context, ignoreWhitespace],
  );
  useEffect(() => {
    const link = (from: HTMLDivElement, to: HTMLDivElement, side: 'left' | 'right') => () => {
      if (!sync || echo.current === side) {
        echo.current = null;
        return;
      }
      echo.current = side === 'left' ? 'right' : 'left';
      to.scrollTop = from.scrollTop;
    };
    const left = leftRef.current;
    const right = rightRef.current;
    if (!left || !right) return;
    const onLeft = link(left, right, 'left');
    const onRight = link(right, left, 'right');
    left.addEventListener('scroll', onLeft);
    right.addEventListener('scroll', onRight);
    return () => {
      left.removeEventListener('scroll', onLeft);
      right.removeEventListener('scroll', onRight);
    };
  }, [sync]);
  const side = (row: DiffRow, key: 'left' | 'right') =>
    row.kind === 'collapsed' ? (
      <div className="bg-surface-elevated px-sm py-1 text-center text-xs text-muted">
        {key === 'left' ? row.leftRange : row.rightRange}
      </div>
    ) : (
      <Cell line={row[key]} kind={row.kind} />
    );
  return (
    <div className="grid min-h-0 grid-cols-1 gap-sm lg:grid-cols-2">
      <div
        ref={leftRef}
        className="max-h-[70vh] overflow-auto rounded-lg bg-surface"
        aria-label="Earlier revision source"
      >
        {rows.map((row, index) => (
          <div key={index}>{side(row, 'left')}</div>
        ))}
      </div>
      <div
        ref={rightRef}
        className="max-h-[70vh] overflow-auto rounded-lg bg-surface"
        aria-label="Later revision source"
      >
        {rows.map((row, index) => (
          <div key={index}>{side(row, 'right')}</div>
        ))}
      </div>
    </div>
  );
}
