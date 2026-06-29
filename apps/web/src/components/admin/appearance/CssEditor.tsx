'use client';

import { useEffect, useRef } from 'react';
import { EditorView, keymap, lineNumbers } from '@codemirror/view';
import { EditorState, Compartment } from '@codemirror/state';
import { css } from '@codemirror/lang-css';
import { syntaxHighlighting, defaultHighlightStyle, bracketMatching, indentOnInput } from '@codemirror/language';
import { history, historyKeymap, defaultKeymap } from '@codemirror/commands';

/**
 * Controlled CodeMirror editor for CSS with syntax highlighting. Replaces the
 * plain textarea in the system-theme manager. Colors/structure use
 * CodeMirror's default highlight style; the chrome uses the app's design tokens.
 */
export function CssEditor({
  value,
  onChange,
  readOnly = false,
  ariaLabel,
}: {
  value: string;
  onChange: (next: string) => void;
  readOnly?: boolean;
  ariaLabel?: string;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  const editableRef = useRef(new Compartment());

  useEffect(() => {
    onChangeRef.current = onChange;
  });

  useEffect(() => {
    if (!hostRef.current) return;
    const view = new EditorView({
      parent: hostRef.current,
      state: EditorState.create({
        doc: value,
        extensions: [
          lineNumbers(),
          history(),
          css(),
          syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
          bracketMatching(),
          indentOnInput(),
          keymap.of([...defaultKeymap, ...historyKeymap]),
          EditorView.lineWrapping,
          editableRef.current.of(EditorView.editable.of(!readOnly)),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) onChangeRef.current(update.state.doc.toString());
          }),
          EditorView.theme({
            '&': { fontSize: '0.75rem', backgroundColor: 'var(--color-surface)', color: 'var(--color-foreground)' },
            '.cm-content': { fontFamily: 'var(--font-mono)' },
            '.cm-scroller': { minHeight: '24rem' },
            '.cm-gutters': { backgroundColor: 'var(--color-surface-elevated)', color: 'var(--color-muted)', border: 'none' },
            '.cm-activeLine': { backgroundColor: 'transparent' },
            '.cm-activeLineGutter': { backgroundColor: 'transparent' },
          }),
        ],
      }),
    });
    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // Mount once; external value changes are synced by the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync external value changes (e.g. selecting a different theme) into the doc.
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (value !== current) {
      view.dispatch({ changes: { from: 0, to: current.length, insert: value } });
    }
  }, [value]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({ effects: editableRef.current.reconfigure(EditorView.editable.of(!readOnly)) });
  }, [readOnly]);

  return (
    <div
      ref={hostRef}
      aria-label={ariaLabel}
      className="overflow-hidden rounded-md border border-border focus-within:ring-2 focus-within:ring-primary/50"
    />
  );
}
