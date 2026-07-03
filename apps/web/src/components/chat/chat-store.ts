'use client';

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { AiCitation, AiQuestionMode } from '@next-wiki/shared';

export type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  thinking?: string;
  citations?: AiCitation[];
  error?: string;
  insufficient?: boolean;
};

type ChatState = {
  mode: AiQuestionMode;
  messages: ChatMessage[];
  open: boolean;
  setMode: (mode: AiQuestionMode) => void;
  setOpen: (open: boolean) => void;
  add: (message: ChatMessage) => void;
  append: (id: string, text: string) => void;
  think: (id: string, text: string) => void;
  insufficient: (id: string) => void;
  citations: (id: string, citations: AiCitation[]) => void;
  fail: (id: string, error: string) => void;
  newSession: () => void;
};

/**
 * Persisted to sessionStorage (not localStorage) so a conversation survives
 * page refreshes and in-app navigation within the same tab, but doesn't leak
 * into a brand new browser session. Hydration is skipped here and applied
 * manually on mount (see AiChatPane) to avoid an SSR/client markup mismatch.
 */
export const useChatStore = create<ChatState>()(
  persist(
    (set) => ({
      mode: 'retrieval',
      messages: [],
      open: false,
      setMode: (mode) => set({ mode }),
      setOpen: (open) => set({ open }),
      add: (message) => set((state) => ({ messages: [...state.messages, message] })),
      append: (id, text) => set((state) => ({
        messages: state.messages.map((message) => message.id === id ? { ...message, text: message.text + text } : message),
      })),
      think: (id, text) => set((state) => ({
        messages: state.messages.map((message) => message.id === id ? { ...message, thinking: (message.thinking ?? '') + text } : message),
      })),
      insufficient: (id) => set((state) => ({
        messages: state.messages.map((message) => message.id === id ? { ...message, text: '', insufficient: true } : message),
      })),
      citations: (id, citations) => set((state) => ({
        messages: state.messages.map((message) => message.id === id ? { ...message, citations } : message),
      })),
      fail: (id, error) => set((state) => ({
        messages: state.messages.map((message) => message.id === id ? { ...message, error } : message),
      })),
      newSession: () => set({ messages: [] }),
    }),
    {
      name: 'ai-chat',
      storage: createJSONStorage(() => sessionStorage),
      skipHydration: true,
      partialize: (state) => ({ mode: state.mode, messages: state.messages, open: state.open }),
    },
  ),
);
