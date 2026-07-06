'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { EditorView, keymap } from '@codemirror/view';
import { EditorState, Compartment } from '@codemirror/state';
import { markdown } from '@codemirror/lang-markdown';
import { history, historyKeymap, defaultKeymap, undo, redo } from '@codemirror/commands';
import { apiPost } from '@/lib/api/client';
import { uploadImage } from '@/lib/api/assets';
import type { ApiError } from '@/lib/api/client';
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
  ImageIcon,
  UndoIcon,
  RedoIcon,
  WrapTextIcon,
  ScrollSyncIcon,
} from '@/components/icons';
import { useAiAvailability } from '@/components/ai/AiAvailabilityContext';
import {
  AiTextOptimizationDialog,
  applyExactSelection,
  hashEditorSelection,
  type EditorSelectionSnapshot,
} from './AiTextOptimizationDialog';
import { AiImageGenerationDialog } from './AiImageGenerationDialog';
import { buildAnchors, buildScrollMap, interpolatePaired, type ScrollAnchor, type ScrollPair } from './scrollSync';

const editableCompartment = new Compartment();
const themeCompartment = new Compartment();
const wrapCompartment = new Compartment();

const WRAP_STORAGE_KEY = 'next-wiki:editor:wrap';
const SCROLL_SYNC_STORAGE_KEY = 'next-wiki:editor:scrollSync';

function readBooleanPreference(key: string, fallback: boolean): boolean {
  if (typeof window === 'undefined') return fallback;
  const stored = window.localStorage.getItem(key);
  return stored === null ? fallback : stored === 'true';
}

function writeBooleanPreference(key: string, value: boolean) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(key, String(value));
}

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

function insertImageReference(view: EditorView, url: string, alt: string) {
  const selection = view.state.selection.main;
  const insert = `![${alt}](${url})`;
  view.dispatch({
    changes: { from: selection.from, to: selection.to, insert },
    selection: { anchor: selection.from + insert.length, head: selection.from + insert.length },
  });
  view.focus();
}

// Insert an image on its own line below the relevant content, leaving existing
// text untouched (used for AI illustrations, which augment the page). When a
// selection position is given the image lands just after that line; otherwise
// it is appended at the end of the document.
function insertImageBelow(view: EditorView, url: string, alt: string, afterPos?: number) {
  const anchorPos = afterPos ?? view.state.doc.length;
  const lineEnd = view.state.doc.lineAt(anchorPos).to;
  const insert = `${lineEnd > 0 ? '\n\n' : ''}![${alt}](${url})`;
  view.dispatch({
    changes: { from: lineEnd, to: lineEnd, insert },
    selection: { anchor: lineEnd + insert.length, head: lineEnd + insert.length },
  });
  view.focus();
}

export function SplitMarkdownEditor({
  pageId,
  revisionId,
  value,
  onChange,
  disabled,
  className = '',
}: {
  pageId?: string;
  revisionId?: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
}) {
  const { t } = useTranslation();
  const ai = useAiAvailability();
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  const disabledRef = useRef(disabled);
  const previewRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const anchorsRef = useRef<ScrollAnchor[]>([]);
  // The scrollTop we last set on each pane ourselves. When a pane emits the
  // resulting 'scroll' event, we recognize it by value and skip it — otherwise
  // the two handlers would ping-pong. Recognizing the echo by value (instead of
  // a timer-cleared boolean) keeps rapid, back-to-back user scrolls in sync.
  const echoRef = useRef<{ editor: number | null; preview: number | null }>({ editor: null, preview: null });
  const [html, setHtml] = useState('');
  // Default to `true` for both on the very first render (server and client
  // alike) so hydration has nothing to diff; the actual persisted value (if
  // different) is applied in an effect below, after mount.
  const [wrapEnabled, setWrapEnabled] = useState(true);
  const [scrollSyncEnabled, setScrollSyncEnabled] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [optimizationSelection, setOptimizationSelection] = useState<EditorSelectionSnapshot | null>(null);
  const [imageSelection, setImageSelection] = useState<EditorSelectionSnapshot | null | undefined>(undefined);

  const snapshotSelection = useCallback(async (): Promise<EditorSelectionSnapshot | null> => {
    const view = viewRef.current;
    if (!view) return null;
    const { from, to } = view.state.selection.main;
    if (from === to) return null;
    const text = view.state.sliceDoc(from, to);
    return { text, from, to, hash: await hashEditorSelection(text) };
  }, []);

  const uploadFiles = useCallback(
    async (files: File[]) => {
      const images = files.filter((f) => f.type.startsWith('image/'));
      if (images.length === 0 || disabledRef.current) return;
      setUploadError(null);
      setUploading(true);
      try {
        for (const file of images) {
          const result = await uploadImage(file);
          const view = viewRef.current;
          if (view) insertImageReference(view, result.url, file.name.replace(/\.[^.]+$/, ''));
        }
      } catch (error) {
        const apiError = error as ApiError;
        setUploadError(apiError?.message ?? t('editor.image.uploadFailed'));
      } finally {
        setUploading(false);
      }
    },
    [t],
  );

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const uploadFilesRef = useRef(uploadFiles);
  useEffect(() => {
    uploadFilesRef.current = uploadFiles;
  }, [uploadFiles]);

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
          wrapCompartment.of(wrapEnabled ? EditorView.lineWrapping : []),
        ],
      }),
      parent: containerRef.current,
    });

    viewRef.current = view;

    const handlePaste = (event: ClipboardEvent) => {
      const items = event.clipboardData?.items;
      if (!items) return;
      const files: File[] = [];
      for (const item of items) {
        if (item.kind === 'file') {
          const file = item.getAsFile();
          if (file && file.type.startsWith('image/')) files.push(file);
        }
      }
      if (files.length > 0) {
        event.preventDefault();
        void uploadFilesRef.current(files);
      }
    };

    const handleDrop = (event: DragEvent) => {
      const files = Array.from(event.dataTransfer?.files ?? []).filter((f) =>
        f.type.startsWith('image/'),
      );
      if (files.length > 0) {
        event.preventDefault();
        void uploadFilesRef.current(files);
      }
    };

    view.dom.addEventListener('paste', handlePaste);
    view.dom.addEventListener('drop', handleDrop);

    return () => {
      view.dom.removeEventListener('paste', handlePaste);
      view.dom.removeEventListener('drop', handleDrop);
      view.destroy();
      viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reconcile the wrap/scroll-sync toggles with their persisted values after
  // mount (client-only). Both start at their SSR-safe default (`true`) on
  // first render so hydration has nothing to diff against; if the stored
  // preference differs, this applies it once, here.
  useEffect(() => {
    const storedWrap = readBooleanPreference(WRAP_STORAGE_KEY, true);
    if (!storedWrap) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setWrapEnabled(false);
      viewRef.current?.dispatch({ effects: wrapCompartment.reconfigure([]) });
    }
    const storedScrollSync = readBooleanPreference(SCROLL_SYNC_STORAGE_KEY, true);
    if (!storedScrollSync) {
      setScrollSyncEnabled(false);
    }
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

  const rebuildAnchors = useCallback(() => {
    const preview = previewRef.current;
    if (!preview) return;
    anchorsRef.current = buildAnchors(preview);
  }, []);

  useEffect(() => {
    rebuildAnchors();
  }, [html, rebuildAnchors]);

  useEffect(() => {
    // Catches async height changes after the initial render (Mermaid
    // diagrams resolve their dynamic `import('mermaid')` after mount and
    // change DOM height; late-loading images do too), in addition to the
    // html-triggered rebuild above.
    const target = previewRef.current?.firstElementChild;
    if (!target) return;
    const observer = new ResizeObserver(() => rebuildAnchors());
    observer.observe(target);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Build the editor↔preview scroll map fresh on each sync: pair every preview
  // `[data-line]` anchor's content offset with the editor's own vertical offset
  // for that source line, then let `buildScrollMap` pin the extremes so both
  // panes reach top and bottom together despite their differing heights.
  const buildPairs = useCallback((): ScrollPair[] => {
    const view = viewRef.current;
    const preview = previewRef.current;
    if (!view || !preview) return [];
    const anchors = anchorsRef.current;
    if (anchors.length === 0) return [];
    const doc = view.state.doc;
    const raw: ScrollPair[] = anchors.map((a) => {
      const line = Math.min(Math.max(a.line, 1), doc.lines);
      return { editor: view.lineBlockAt(doc.line(line).from).top, preview: a.offsetTop };
    });
    const editorMax = view.scrollDOM.scrollHeight - view.scrollDOM.clientHeight;
    const previewMax = preview.scrollHeight - preview.clientHeight;
    return buildScrollMap(raw, editorMax, previewMax);
  }, []);

  // Set a pane's scrollTop and remember the value so the resulting 'scroll'
  // event is recognized as our own echo and does not bounce back.
  const applyScroll = useCallback((el: HTMLElement, key: 'editor' | 'preview', top: number) => {
    const clamped = Math.max(0, Math.min(top, el.scrollHeight - el.clientHeight));
    echoRef.current[key] = clamped;
    el.scrollTop = clamped;
  }, []);

  const handleEditorScroll = useCallback(() => {
    const view = viewRef.current;
    const preview = previewRef.current;
    if (!view || !preview) return;
    const scrollDOM = view.scrollDOM;
    if (echoRef.current.editor !== null && Math.abs(scrollDOM.scrollTop - echoRef.current.editor) <= 1) {
      echoRef.current.editor = null;
      return;
    }
    if (!scrollSyncEnabled) return;

    const previewMax = preview.scrollHeight - preview.clientHeight;
    const pairs = buildPairs();
    const target = pairs.length
      ? interpolatePaired(pairs, scrollDOM.scrollTop, 'editor')
      : (scrollDOM.scrollTop / (scrollDOM.scrollHeight - scrollDOM.clientHeight || 1)) * previewMax;
    applyScroll(preview, 'preview', target);
  }, [scrollSyncEnabled, buildPairs, applyScroll]);

  const handlePreviewScroll = useCallback(() => {
    const view = viewRef.current;
    const preview = previewRef.current;
    if (!view || !preview) return;
    if (echoRef.current.preview !== null && Math.abs(preview.scrollTop - echoRef.current.preview) <= 1) {
      echoRef.current.preview = null;
      return;
    }
    if (!scrollSyncEnabled) return;

    const scrollDOM = view.scrollDOM;
    const editorMax = scrollDOM.scrollHeight - scrollDOM.clientHeight;
    const pairs = buildPairs();
    const target = pairs.length
      ? interpolatePaired(pairs, preview.scrollTop, 'preview')
      : (preview.scrollTop / (preview.scrollHeight - preview.clientHeight || 1)) * editorMax;
    applyScroll(scrollDOM, 'editor', target);
  }, [scrollSyncEnabled, buildPairs, applyScroll]);

  // Clicking (or moving the caret with the pointer) drives the preview so the
  // caret's line keeps the same on-screen height in both panes — a lighter
  // touch than a full scroll so the reader's eye stays on the edited spot.
  const handleEditorPointerSync = useCallback(() => {
    if (!scrollSyncEnabled) return;
    const view = viewRef.current;
    const preview = previewRef.current;
    if (!view || !preview) return;
    const pairs = buildPairs();
    if (!pairs.length) return;

    const caretTop = view.lineBlockAt(view.state.selection.main.head).top;
    const previewOffset = interpolatePaired(pairs, caretTop, 'editor');
    const onScreenY = caretTop - view.scrollDOM.scrollTop;
    applyScroll(preview, 'preview', previewOffset - onScreenY);
  }, [scrollSyncEnabled, buildPairs, applyScroll]);

  useEffect(() => {
    const view = viewRef.current;
    const scrollDOM = view?.scrollDOM;
    const preview = previewRef.current;
    if (!view || !scrollDOM || !preview) return;
    scrollDOM.addEventListener('scroll', handleEditorScroll);
    preview.addEventListener('scroll', handlePreviewScroll);
    view.dom.addEventListener('mouseup', handleEditorPointerSync);
    return () => {
      scrollDOM.removeEventListener('scroll', handleEditorScroll);
      preview.removeEventListener('scroll', handlePreviewScroll);
      view.dom.removeEventListener('mouseup', handleEditorPointerSync);
    };
  }, [handleEditorScroll, handlePreviewScroll, handleEditorPointerSync]);

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

  const toggleWrap = useCallback(() => {
    setWrapEnabled((prev) => {
      const next = !prev;
      writeBooleanPreference(WRAP_STORAGE_KEY, next);
      viewRef.current?.dispatch({
        effects: wrapCompartment.reconfigure(next ? EditorView.lineWrapping : []),
      });
      return next;
    });
  }, []);

  const toggleScrollSync = useCallback(() => {
    setScrollSyncEnabled((prev) => {
      const next = !prev;
      writeBooleanPreference(SCROLL_SYNC_STORAGE_KEY, next);
      return next;
    });
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
        <ToolbarButton
          onClick={() => fileInputRef.current?.click()}
          label={t('editor.toolbar.image')}
          disabled={uploading || disabled}
        >
          <ImageIcon />
        </ToolbarButton>
        {pageId && revisionId && ai?.textOptimizationEnabled && (
          <ToolbarButton
            onClick={() => { void snapshotSelection().then((selection) => { if (selection) setOptimizationSelection(selection); }); }}
            label={t('ai.optimize.toolbar')}
            disabled={disabled}
          >
            <span aria-hidden="true">AI</span>
          </ToolbarButton>
        )}
        {pageId && revisionId && ai?.imageGenerationEnabled && (
          <ToolbarButton
            onClick={() => { void snapshotSelection().then((selection) => setImageSelection(selection)); }}
            label={t('ai.image.toolbar')}
            disabled={disabled}
          >
            <span aria-hidden="true">✦</span>
          </ToolbarButton>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml"
          multiple
          className="hidden"
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            e.target.value = '';
            void uploadFiles(files);
          }}
        />
        {uploading && (
          <span className="ml-xs text-xs text-muted" role="status">
            {t('editor.image.uploading')}
          </span>
        )}
        <div className="w-px h-5 bg-border mx-xs" />
        <ToolbarButton onClick={handleUndo} label={t('editor.toolbar.undo')}>
          <UndoIcon />
        </ToolbarButton>
        <ToolbarButton onClick={handleRedo} label={t('editor.toolbar.redo')}>
          <RedoIcon />
        </ToolbarButton>
        <div className="w-px h-5 bg-border mx-xs ml-auto" />
        <ToolbarButton onClick={toggleWrap} label={t('editor.toolbar.wrap')} active={wrapEnabled}>
          <WrapTextIcon />
        </ToolbarButton>
        <ToolbarButton
          onClick={toggleScrollSync}
          label={t('editor.toolbar.scrollSync')}
          active={scrollSyncEnabled}
        >
          <ScrollSyncIcon />
        </ToolbarButton>
      </div>

      {uploadError && (
        <div
          className="px-md py-sm text-sm text-danger bg-danger-subtle border-b border-border"
          role="alert"
        >
          {uploadError}
        </div>
      )}

      <div className="flex-1 flex overflow-hidden">
        <div
          ref={containerRef}
          className="w-1/2 h-full resize-none border-r border-border bg-background font-mono text-sm leading-relaxed disabled:opacity-60 [&_.cm-editor]:h-full [&_.cm-editor]:bg-background"
        />
        <div
          ref={previewRef}
          data-testid="editor-preview-pane"
          className="w-1/2 h-full overflow-auto p-md bg-background"
        >
          <ContentRenderer html={html} />
        </div>
      </div>
      {pageId && revisionId && optimizationSelection && (
        <AiTextOptimizationDialog
          pageId={pageId}
          revisionId={revisionId}
          selection={optimizationSelection}
          onClose={() => setOptimizationSelection(null)}
          onAccept={(replacement, original) => {
            const view = viewRef.current;
            if (!view) return false;
            if (applyExactSelection(view.state.doc.toString(), original, replacement) === null) return false;
            view.dispatch({
              changes: { from: original.from, to: original.to, insert: replacement },
              selection: { anchor: original.from + replacement.length },
            });
            view.focus();
            return true;
          }}
        />
      )}
      {pageId && revisionId && imageSelection !== undefined && (
        <AiImageGenerationDialog
          pageId={pageId}
          revisionId={revisionId}
          selection={imageSelection}
          onClose={() => setImageSelection(undefined)}
          onInsert={(url) => {
            const view = viewRef.current;
            if (view) insertImageBelow(view, url, 'AI generated illustration', imageSelection?.to);
          }}
        />
      )}
    </div>
  );
}

function ToolbarButton({
  onClick,
  label,
  children,
  disabled = false,
  active,
}: {
  onClick: () => void;
  label: string;
  children: React.ReactNode;
  disabled?: boolean;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={active}
      title={label}
      className={`inline-flex items-center justify-center w-8 h-8 rounded transition-colors disabled:opacity-50 disabled:pointer-events-none ${
        active ? 'bg-surface text-foreground' : 'text-muted hover:text-foreground hover:bg-surface'
      }`}
    >
      {children}
    </button>
  );
}
