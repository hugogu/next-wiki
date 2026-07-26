'use client';

import { useEffect, useMemo, useRef } from 'react';
import { EditorView, keymap, lineNumbers } from '@codemirror/view';
import { EditorState, Compartment, type Extension } from '@codemirror/state';
import { css } from '@codemirror/lang-css';
import { markdown } from '@codemirror/lang-markdown';
import {
  syntaxHighlighting,
  defaultHighlightStyle,
  bracketMatching,
  indentOnInput,
} from '@codemirror/language';
import { history, historyKeymap, defaultKeymap } from '@codemirror/commands';

/**
 * Controlled CodeMirror editor primitive.
 *
 * Extracted from the system-theme CSS editor so the skill file editor is not a
 * third bespoke CodeMirror mount: constitution P6 requires UI primitives to live
 * here, and the anti-pattern list names copy-pasted per-feature styling
 * explicitly.
 *
 * Syntax colours come from CodeMirror's default highlight style; the chrome uses
 * the app's design tokens.
 */
export type CodeEditorLanguage = 'css' | 'markdown' | 'plain';

/** Map a content type onto a supported mode. Anything without a grammar we ship
 * falls back to plain text, which still gets line numbers, history, and
 * wrapping — a script is readable without highlighting, and shipping a grammar
 * per language would bloat the bundle for a rarely-opened admin screen. */
export function languageForContentType(contentType: string): CodeEditorLanguage {
  if (contentType === 'text/css') return 'css';
  if (contentType === 'text/markdown') return 'markdown';
  return 'plain';
}

function languageExtension(language: CodeEditorLanguage): Extension[] {
  if (language === 'css') return [css()];
  if (language === 'markdown') return [markdown()];
  return [];
}

export function CodeEditor({
  value,
  onChange,
  language = 'plain',
  readOnly = false,
  ariaLabel,
  minHeight = '24rem',
}: {
  value: string;
  onChange: (next: string) => void;
  language?: CodeEditorLanguage;
  readOnly?: boolean;
  ariaLabel?: string;
  minHeight?: string;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  const editableRef = useRef(new Compartment());
  const languageRef = useRef(new Compartment());
  const initial = useMemo(() => ({ value, language, readOnly, minHeight }), []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    onChangeRef.current = onChange;
  });

  useEffect(() => {
    if (!hostRef.current) return;
    const view = new EditorView({
      parent: hostRef.current,
      state: EditorState.create({
        doc: initial.value,
        extensions: [
          lineNumbers(),
          history(),
          languageRef.current.of(languageExtension(initial.language)),
          syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
          bracketMatching(),
          indentOnInput(),
          keymap.of([...defaultKeymap, ...historyKeymap]),
          EditorView.lineWrapping,
          editableRef.current.of(EditorView.editable.of(!initial.readOnly)),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) onChangeRef.current(update.state.doc.toString());
          }),
          EditorView.theme({
            '&': {
              fontSize: '0.75rem',
              backgroundColor: 'var(--color-surface)',
              color: 'var(--color-foreground)',
            },
            '.cm-content': { fontFamily: 'var(--font-mono)' },
            '.cm-scroller': { minHeight: initial.minHeight },
            '.cm-gutters': {
              backgroundColor: 'var(--color-surface-elevated)',
              color: 'var(--color-muted)',
              border: 'none',
            },
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
    // Mount once; external changes are synced by the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync external value changes (selecting a different theme, or a different
  // skill file) into the document.
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
    view.dispatch({
      effects: editableRef.current.reconfigure(EditorView.editable.of(!readOnly)),
    });
  }, [readOnly]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: languageRef.current.reconfigure(languageExtension(language)),
    });
  }, [language]);

  return (
    <div
      ref={hostRef}
      aria-label={ariaLabel}
      className="overflow-hidden rounded-md border border-border focus-within:ring-2 focus-within:ring-primary/50"
    />
  );
}
