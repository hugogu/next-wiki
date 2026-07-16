'use client';

import { createContext, useContext, type ReactNode } from 'react';

type PageEditValue = { canEdit: boolean; pageId?: string };

const PageEditContext = createContext<PageEditValue>({ canEdit: false });

/**
 * Exposes the reader's client-resolved edit capability (and page id) to
 * components rendered inside the document body — notably the sidebar tags,
 * which are server-rendered and cannot otherwise know the hydrated session.
 */
export function PageEditProvider({ value, children }: { value: PageEditValue; children: ReactNode }) {
  return <PageEditContext.Provider value={value}>{children}</PageEditContext.Provider>;
}

export function usePageEdit(): PageEditValue {
  return useContext(PageEditContext);
}
