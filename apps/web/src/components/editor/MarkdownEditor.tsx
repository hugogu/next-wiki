'use client';

import { useEffect, useRef } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { type Editor } from '@tiptap/core';

function getMarkdown(editor: Editor): string {
  const fragments: string[] = [];
  editor.state.doc.content.content.forEach((node) => {
    switch (node.type.name) {
      case 'heading':
        fragments.push(`${'#'.repeat(node.attrs.level as number)} ${node.textContent}`);
        break;
      case 'bulletList':
        fragments.push(
          node.content.content.map((item) => `- ${item.textContent}`).join('\n'),
        );
        break;
      case 'orderedList':
        fragments.push(
          node.content.content.map((item, i) => `${i + 1}. ${item.textContent}`).join('\n'),
        );
        break;
      case 'paragraph':
      default:
        fragments.push(node.textContent);
    }
  });
  return fragments.join('\n\n');
}

interface MarkdownEditorProps {
  value: string;
  onChange: (markdown: string) => void;
  placeholder?: string;
  disabled?: boolean;
  'aria-label'?: string;
}

export function MarkdownEditor({ value, onChange, placeholder, disabled, 'aria-label': ariaLabel }: MarkdownEditorProps) {
  const prevValueRef = useRef(value);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder: placeholder ?? 'Start writing...' }),
    ],
    content: markdownToHtml(value),
    editable: !disabled,
    onUpdate: ({ editor }) => {
      const markdown = getMarkdown(editor);
      prevValueRef.current = markdown;
      onChange(markdown);
    },
    editorProps: {
      attributes: {
        role: 'textbox',
        'aria-multiline': 'true',
        'aria-label': ariaLabel ?? 'Markdown editor',
      },
    },
  });

  useEffect(() => {
    if (editor && !editor.isDestroyed && value !== prevValueRef.current) {
      editor.commands.setContent(markdownToHtml(value));
      prevValueRef.current = value;
    }
  }, [editor, value]);

  if (!editor) return null;

  return (
    <div className="border border-border rounded-md bg-surface focus-within:ring-2 focus-within:ring-primary/50">
      <EditorContent editor={editor} className="prose max-w-none p-md min-h-[200px]" />
    </div>
  );
}

function markdownToHtml(markdown: string): string {
  const lines = markdown.split('\n');
  const parts: string[] = [];
  let inList: 'ul' | 'ol' | null = null;

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (line.startsWith('### ')) {
      closeList(parts, inList);
      inList = null;
      parts.push(`<h3>${escapeHtml(line.slice(4))}</h3>`);
    } else if (line.startsWith('## ')) {
      closeList(parts, inList);
      inList = null;
      parts.push(`<h2>${escapeHtml(line.slice(3))}</h2>`);
    } else if (line.startsWith('# ')) {
      closeList(parts, inList);
      inList = null;
      parts.push(`<h1>${escapeHtml(line.slice(2))}</h1>`);
    } else if (line.startsWith('- ')) {
      if (inList !== 'ul') {
        closeList(parts, inList);
        parts.push('<ul>');
        inList = 'ul';
      }
      parts.push(`<li>${escapeHtml(line.slice(2))}</li>`);
    } else if (/^\d+\. /.test(line)) {
      if (inList !== 'ol') {
        closeList(parts, inList);
        parts.push('<ol>');
        inList = 'ol';
      }
      parts.push(`<li>${escapeHtml(line.replace(/^\d+\. /, ''))}</li>`);
    } else if (line === '') {
      if (inList) {
        closeList(parts, inList);
        inList = null;
      }
      parts.push('<p></p>');
    } else {
      if (inList) {
        closeList(parts, inList);
        inList = null;
      }
      parts.push(`<p>${escapeHtml(line)}</p>`);
    }
  }

  closeList(parts, inList);
  return parts.join('');
}

function closeList(parts: string[], list: 'ul' | 'ol' | null) {
  if (list === 'ul') parts.push('</ul>');
  if (list === 'ol') parts.push('</ol>');
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
