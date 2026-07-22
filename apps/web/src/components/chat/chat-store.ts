'use client';

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type {
  AiCitation,
  AiQuestionMode,
  AiToolCallEventPayload,
  AiToolProposalEventPayload,
} from '@next-wiki/shared';

export type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  thinking?: string;
  citations?: AiCitation[];
  toolCalls?: AiToolCallEventPayload[];
  toolProposals?: AiToolProposalEventPayload[];
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
  toolCall: (id: string, payload: AiToolCallEventPayload) => void;
  toolProposal: (id: string, payload: AiToolProposalEventPayload) => void;
  insufficient: (id: string) => void;
  citations: (id: string, citations: AiCitation[]) => void;
  fail: (id: string, error: string) => void;
  newSession: () => void;
  loadSession: (session: {
    mode: AiQuestionMode;
    question: string;
    answer: string;
    citations: AiCitation[];
    insufficient: boolean;
  }) => void;
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
      toolCall: (id, payload) => set((state) => ({
        messages: state.messages.map((message) => {
          if (message.id !== id) return message;
          const existing = message.toolCalls ?? [];
          const index = existing.findIndex((item) => item.toolCallId === payload.toolCallId);
          const toolCalls = index === -1
            ? [...existing, payload]
            : existing.map((item, itemIndex) => itemIndex === index ? { ...item, ...payload } : item);
          return { ...message, toolCalls };
        }),
      })),
      toolProposal: (id, payload) => set((state) => ({
        messages: state.messages.map((message) => {
          if (message.id !== id) return message;
          const existing = message.toolProposals ?? [];
          const index = existing.findIndex((item) => item.proposalId === payload.proposalId);
          const toolProposals = index === -1
            ? [...existing, payload]
            : existing.map((item, itemIndex) => itemIndex === index ? { ...item, ...payload } : item);
          return { ...message, toolProposals };
        }),
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
      loadSession: ({ mode, question, answer, citations, insufficient }) => set({
        mode,
        open: true,
        messages: [
          { id: crypto.randomUUID(), role: 'user', text: question },
          { id: crypto.randomUUID(), role: 'assistant', text: answer, citations, insufficient },
        ],
      }),
    }),
    {
      name: 'ai-chat',
      storage: createJSONStorage(() => sessionStorage),
      skipHydration: true,
      partialize: (state) => ({ mode: state.mode, messages: state.messages, open: state.open }),
    },
  ),
);
