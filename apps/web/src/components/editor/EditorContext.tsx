'use client';

import { createContext, useContext, useState, useCallback } from 'react';

type EditorState = {
  title: string;
  defaultTitle: string;
  isSaving: boolean;
  hasChanges: boolean;
  propertiesOpen: boolean;
  toggleProperties: () => void;
  save: () => void;
  close: () => void;
  canDelete: boolean;
  requestDelete: () => void;
};

type EditorContextValue = {
  editor: EditorState | null;
  setEditor: (editor: EditorState | null) => void;
};

const EditorContext = createContext<EditorContextValue>({
  editor: null,
  setEditor: () => {},
});

export function EditorProvider({ children }: { children: React.ReactNode }) {
  const [editor, setEditor] = useState<EditorState | null>(null);
  const setEditorCallback = useCallback((value: EditorState | null) => {
    setEditor(value);
  }, []);

  return (
    <EditorContext.Provider value={{ editor, setEditor: setEditorCallback }}>
      {children}
    </EditorContext.Provider>
  );
}

export function useEditor(): EditorState | null {
  return useContext(EditorContext).editor;
}

export function useSetEditor(): (editor: EditorState | null) => void {
  return useContext(EditorContext).setEditor;
}
