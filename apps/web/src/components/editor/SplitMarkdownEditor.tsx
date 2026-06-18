'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { apiPost } from '@/lib/api/client';
import {
  HeadingIcon,
  BoldIcon,
  ItalicIcon,
  CodeIcon,
  CodeBlockIcon,
  ListIcon,
  QuoteIcon,
  LinkIcon,
} from '@/components/icons';

function insertText(textarea: HTMLTextAreaElement, before: string, after: string = '') {
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const value = textarea.value;
  const selected = value.slice(start, end);
  const replacement = `${before}${selected}${after}`;
  const newValue = value.slice(0, start) + replacement + value.slice(end);
  const newCursor = start + before.length + selected.length;
  return { newValue, newCursor };
}

export function SplitMarkdownEditor({
  value,
  onChange,
  disabled,
  className = '',
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
}) {
  const sourceRef = useRef<HTMLTextAreaElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const [html, setHtml] = useState('');
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    apiPost<{ contentSource: string }, { html: string }>('/api/preview', { contentSource: value })
      .then((res) => {
        if (!cancelled) setHtml(res.html);
      })
      .catch(() => {
        if (!cancelled) setHtml('');
      });
    return () => {
      cancelled = true;
    };
  }, [value]);

  const handleScroll = useCallback(() => {
    const source = sourceRef.current;
    const preview = previewRef.current;
    if (!source || !preview || syncing) return;

    const ratio = source.scrollTop / (source.scrollHeight - source.clientHeight || 1);
    setSyncing(true);
    preview.scrollTop = ratio * (preview.scrollHeight - preview.clientHeight);
    setTimeout(() => setSyncing(false), 50);
  }, [syncing]);

  const apply = (before: string, after: string = '') => {
    const textarea = sourceRef.current;
    if (!textarea) return;
    const { newValue, newCursor } = insertText(textarea, before, after);
    onChange(newValue);
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(newCursor, newCursor);
    }, 0);
  };

  return (
    <div className={`flex flex-col h-full overflow-hidden ${className}`}>
      <div className="flex items-center gap-xs px-md py-sm border-b border-border bg-surface-elevated">
        <ToolbarButton onClick={() => apply('# ', '\n')} label="Heading">
          <HeadingIcon />
        </ToolbarButton>
        <ToolbarButton onClick={() => apply('**', '**')} label="Bold">
          <BoldIcon />
        </ToolbarButton>
        <ToolbarButton onClick={() => apply('*', '*')} label="Italic">
          <ItalicIcon />
        </ToolbarButton>
        <ToolbarButton onClick={() => apply('\u0060', '\u0060')} label="Inline code">
          <CodeIcon />
        </ToolbarButton>
        <ToolbarButton onClick={() => apply('```\n', '\n```')} label="Code block">
          <CodeBlockIcon />
        </ToolbarButton>
        <ToolbarButton onClick={() => apply('- ', '\n')} label="Bullet list">
          <ListIcon />
        </ToolbarButton>
        <ToolbarButton onClick={() => apply('> ', '\n')} label="Quote">
          <QuoteIcon />
        </ToolbarButton>
        <ToolbarButton onClick={() => apply('[', '](url)')} label="Link">
          <LinkIcon />
        </ToolbarButton>
      </div>

      <div className="flex-1 flex overflow-hidden">
        <textarea
          ref={sourceRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onScroll={handleScroll}
          disabled={disabled}
          placeholder="Write in Markdown..."
          className="w-1/2 h-full resize-none border-r border-border bg-background p-md font-mono text-sm leading-relaxed focus:outline-none focus:ring-inset focus:ring-2 focus:ring-primary/30 disabled:opacity-60"
          spellCheck={false}
        />
        <div
          ref={previewRef}
          className="w-1/2 h-full overflow-auto p-md bg-background"
        >
          <div
            className="prose max-w-none"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        </div>
      </div>
    </div>
  );
}

function ToolbarButton({ onClick, label, children }: { onClick: () => void; label: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="inline-flex items-center justify-center w-8 h-8 rounded text-muted hover:text-foreground hover:bg-surface transition-colors"
    >
      {children}
    </button>
  );
}
