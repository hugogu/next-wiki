'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { EditorView, keymap } from '@codemirror/view';
import { EditorState, Compartment } from '@codemirror/state';
import { markdown } from '@codemirror/lang-markdown';
import { history, historyKeymap, defaultKeymap, undo, redo } from '@codemirror/commands';
import { apiPost } from '@/lib/api/client';
import { ContentRenderer } from '@/components/renderer/ContentRenderer';
import { useTranslation } from '@/i18n/client';
import {
  HeadingIcon,
  BoldIcon,
  ItalicIcon,
  CodeIcon,
  CodeBlockIcon,
  ListIcon,
  QuoteIcon,
  LinkIcon,
  UndoIcon,
  RedoIcon,
} from '@/components/icons';

const editableCompartment = new Compartment();
const themeCompartment = new Compartment();

function codeMirrorTheme() {
  return EditorView.theme(
    {
      '&': {
        backgroundColor: 'transparent',
        height: '100%',
        fontSize: '0.875rem',
        lineHeight: '1.625',
      },
      '.cm-content': {
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
        padding: '1rem',
        caretColor: 'var(--color-foreground)',
      },
      '.cm-gutters': {
        display: 'none',
      },
      '.cm-activeLine': {
        backgroundColor: 'transparent',
      },
      '.cm-selectionBackground': {
        backgroundColor: 'var(--color-ring)',
      },
      '.cm-cursor': {
        borderLeftColor: 'var(--color-foreground)',
      },
      '&.cm-focused .cm-cursor': {
        borderLeftColor: 'var(--color-foreground)',
      },
      '&.cm-focused .cm-selectionBackground': {
        backgroundColor: 'var(--color-ring)',
      },
      '.cm-line': {
        padding: '0',
      },
    },
    { dark: false },
  );
}

function insertAround(view: EditorView, before: string, after: string = '') {
  const { state } = view;
  const selection = state.selection.main;
  const selected = state.sliceDoc(selection.from, selection.to);
  const insert = `${before}${selected}${after}`;
  view.dispatch({
    changes: { from: selection.from, to: selection.to, insert },
    selection: {
      anchor: selection.from + before.length + selected.length,
      head: selection.from + before.length + selected.length,
    },
  });
  view.focus();
}

function insertBlock(view: EditorView, prefix: string, suffix: string = '') {
  const { state } = view;
  const selection = state.selection.main;
  const lineFrom = state.doc.lineAt(selection.from).from;
  const lineTo = state.doc.lineAt(selection.to).to;
  const selected = state.sliceDoc(lineFrom, lineTo);
  const insert = selected
    .split('\n')
    .map((line) => `${prefix}${line}`)
    .join('\n');
  const replacement = `${insert}${suffix}`;
  view.dispatch({
    changes: { from: lineFrom, to: lineTo, insert: replacement },
    selection: { anchor: lineFrom + replacement.length, head: lineFrom + replacement.length },
  });
  view.focus();
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
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  const disabledRef = useRef(disabled);
  const previewRef = useRef<HTMLDivElement>(null);
  const [html, setHtml] = useState('');
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    disabledRef.current = disabled;
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: editableCompartment.reconfigure(EditorView.editable.of(!disabled)),
    });
  }, [disabled]);

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

  useEffect(() => {
    if (!containerRef.current) return;

    const view = new EditorView({
      state: EditorState.create({
        doc: value,
        extensions: [
          history(),
          markdown({ codeLanguages: [] }),
          keymap.of([...defaultKeymap, ...historyKeymap]),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              onChangeRef.current(update.state.doc.toString());
            }
          }),
          editableCompartment.of(EditorView.editable.of(!disabledRef.current)),
          themeCompartment.of(codeMirrorTheme()),
        ],
      }),
      parent: containerRef.current,
    });

    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current === value) return;
    view.dispatch({
      changes: { from: 0, to: current.length, insert: value },
    });
  }, [value]);

  const handleScroll = useCallback(() => {
    const source = viewRef.current?.scrollDOM;
    const preview = previewRef.current;
    if (!source || !preview || syncing) return;

    const ratio = source.scrollTop / (source.scrollHeight - source.clientHeight || 1);
    setSyncing(true);
    preview.scrollTop = ratio * (preview.scrollHeight - preview.clientHeight);
    setTimeout(() => setSyncing(false), 50);
  }, [syncing]);

  useEffect(() => {
    const scrollDOM = viewRef.current?.scrollDOM;
    if (!scrollDOM) return;
    scrollDOM.addEventListener('scroll', handleScroll);
    return () => scrollDOM.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);

  const apply = useCallback((before: string, after: string = '', block = false) => {
    const view = viewRef.current;
    if (!view) return;
    if (block) {
      insertBlock(view, before, after);
    } else {
      insertAround(view, before, after);
    }
  }, []);

  const handleUndo = useCallback(() => {
    const view = viewRef.current;
    if (!view) return;
    undo(view);
    view.focus();
  }, []);

  const handleRedo = useCallback(() => {
    const view = viewRef.current;
    if (!view) return;
    redo(view);
    view.focus();
  }, []);

  return (
    <div className={`flex flex-col h-full overflow-hidden ${className}`}>
      <div className="flex items-center gap-xs px-md py-sm border-b border-border bg-surface-elevated">
        <ToolbarButton onClick={() => apply('# ', '\n', true)} label={t('editor.toolbar.heading')}>
          <HeadingIcon />
        </ToolbarButton>
        <ToolbarButton onClick={() => apply('**', '**')} label={t('editor.toolbar.bold')}>
          <BoldIcon />
        </ToolbarButton>
        <ToolbarButton onClick={() => apply('*', '*')} label={t('editor.toolbar.italic')}>
          <ItalicIcon />
        </ToolbarButton>
        <ToolbarButton onClick={() => apply('\u0060', '\u0060')} label={t('editor.toolbar.inlineCode')}>
          <CodeIcon />
        </ToolbarButton>
        <ToolbarButton onClick={() => apply('```\n', '\n```')} label={t('editor.toolbar.codeBlock')}>
          <CodeBlockIcon />
        </ToolbarButton>
        <ToolbarButton onClick={() => apply('- ', '\n', true)} label={t('editor.toolbar.bulletList')}>
          <ListIcon />
        </ToolbarButton>
        <ToolbarButton onClick={() => apply('> ', '\n', true)} label={t('editor.toolbar.quote')}>
          <QuoteIcon />
        </ToolbarButton>
        <ToolbarButton onClick={() => apply('[', '](url)')} label={t('editor.toolbar.link')}>
          <LinkIcon />
        </ToolbarButton>
        <div className="w-px h-5 bg-border mx-xs" />
        <ToolbarButton onClick={handleUndo} label={t('editor.toolbar.undo')}>
          <UndoIcon />
        </ToolbarButton>
        <ToolbarButton onClick={handleRedo} label={t('editor.toolbar.redo')}>
          <RedoIcon />
        </ToolbarButton>
      </div>

      <div className="flex-1 flex overflow-hidden">
        <div
          ref={containerRef}
          className="w-1/2 h-full resize-none border-r border-border bg-background font-mono text-sm leading-relaxed disabled:opacity-60 [&_.cm-editor]:h-full [&_.cm-editor]:bg-background"
        />
        <div
          ref={previewRef}
          className="w-1/2 h-full overflow-auto p-md bg-background"
        >
          <ContentRenderer html={html} />
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
