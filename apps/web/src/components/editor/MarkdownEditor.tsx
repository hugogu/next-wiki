'use client';

import { useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import type { Editor as ToastEditor, EditorProps } from '@toast-ui/react-editor';
import '@toast-ui/editor/dist/toastui-editor.css';

const Editor = dynamic(
  () => import('@toast-ui/react-editor').then((mod) => mod.Editor),
  { ssr: false },
);

type MarkdownEditorProps = {
  value: string;
  onChange: (markdown: string) => void;
  placeholder?: string;
  disabled?: boolean;
  'aria-label'?: string;
};

export function MarkdownEditor({
  value,
  onChange,
  placeholder,
  disabled,
  'aria-label': ariaLabel,
}: MarkdownEditorProps) {
  const editorRef = useRef<ToastEditor>(null);
  const lastValueRef = useRef(value);

  useEffect(() => {
    const instance = editorRef.current?.getInstance();
    if (!instance) return;

    const current = instance.getMarkdown();
    if (current !== lastValueRef.current) {
      lastValueRef.current = value;
      instance.setMarkdown(value ?? '');
    }
  }, [value]);

  const handleChange: EditorProps['onChange'] = () => {
    const instance = editorRef.current?.getInstance();
    if (!instance) return;
    const markdown = instance.getMarkdown();
    lastValueRef.current = markdown;
    onChange(markdown);
  };

  return (
    <div
      className={`border border-border rounded-md overflow-hidden ${disabled ? 'opacity-60 pointer-events-none' : ''}`}
      aria-label={ariaLabel}
    >
      <Editor
        ref={editorRef}
        initialValue={value ?? ''}
        initialEditType="markdown"
        previewStyle="tab"
        height="400px"
        placeholder={placeholder}
        onChange={handleChange}
        usageStatistics={false}
        hideModeSwitch={false}
        toolbarItems={[
          ['heading', 'bold', 'italic', 'strike'],
          ['hr', 'quote'],
          ['ul', 'ol', 'task', 'indent', 'outdent'],
          ['table', 'link'],
          ['code', 'codeblock'],
        ]}
      />
    </div>
  );
}
