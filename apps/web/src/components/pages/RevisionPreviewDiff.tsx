'use client';

import { useEffect, useRef } from 'react';
import { ContentRenderer } from '@/components/renderer/ContentRenderer';
import { changedLineNumbers, buildDiffRows } from '@/lib/revision-diff';

function PreviewPane({ html, lines, label }: { html: string; lines: Set<number>; label: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { ref.current?.querySelectorAll<HTMLElement>('[data-line]').forEach((element) => element.classList.toggle('ring-2', lines.has(Number(element.dataset.line)))); }, [lines]);
  return <div ref={ref} className="max-h-[70vh] overflow-auto rounded-lg border border-border p-md" aria-label={label}><ContentRenderer html={html} /></div>;
}

export function RevisionPreviewDiff({ before, after, beforeHtml, afterHtml }: { before: string; after: string; beforeHtml: string; afterHtml: string }) {
  const lines = changedLineNumbers(buildDiffRows(before, after));
  return <div className="grid min-h-0 grid-cols-1 gap-sm lg:grid-cols-2"><PreviewPane html={beforeHtml} lines={lines.left} label="Earlier revision preview" /><PreviewPane html={afterHtml} lines={lines.right} label="Later revision preview" /></div>;
}
