'use client';

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type {
  AiCitation,
  AiQuestionMode,
  AiToolCallEventPayload,
  AiToolProposalEventPayload,
} from '@next-wiki/shared';

export function createChatSessionId(): string {
  return crypto.randomUUID();
}

export type ChatRetrievalResult = {
  title: string;
  path: string;
  spaceSlug?: string;
};

export type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  thinking?: string;
  citations?: AiCitation[];
  toolCalls?: AiToolCallEventPayload[];
  toolProposals?: AiToolProposalEventPayload[];
  searchResults?: ChatRetrievalResult[];
  error?: string;
  insufficient?: boolean;
  /**
   * Server-side `ai_actions.id` for the assistant turn, set when `action.start`
   * succeeds. Persisted so the pane can reconcile a failed message with the
   * authoritative server state on mount (the server may have completed the
   * turn even if the client's POST/EventSource was interrupted by a proxy).
   */
  actionId?: string;
};

type ChatState = {
  sessionId: string;
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
  searchResults: (id: string, results: ChatRetrievalResult[]) => void;
  insufficient: (id: string) => void;
  citations: (id: string, citations: AiCitation[]) => void;
  fail: (id: string, error: string) => void;
  /**
   * Stamp an assistant message with the server-side actionId so the pane can
   * reconcile it with the authoritative server state on mount if the
   * client-side stream was interrupted.
   */
  setActionId: (id: string, actionId: string) => void;
  /**
   * Overwrite an assistant message with recovered server state. Used by the
   * pane auto-recovery effect when a failed message turns out to have
   * actually completed server-side (the client's POST/EventSource was
   * interrupted, but the server still finished the turn and captured it
   * into the raw conversation). Pass the fields that should be replaced.
   */
  recoverMessage: (
    id: string,
    recovery: {
      text?: string;
      thinking?: string;
      citations?: AiCitation[];
      toolCalls?: AiToolCallEventPayload[];
      searchResults?: ChatRetrievalResult[];
      error?: string;
      insufficient?: boolean;
    },
  ) => void;
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
      sessionId: createChatSessionId(),
      mode: 'retrieval',
      messages: [],
      open: false,
      setMode: (mode) => set({ mode }),
      setOpen: (open) => set({ open }),
      add: (message) => set((state) => ({ messages: [...state.messages, message] })),
      append: (id, text) => set((state) => ({
        messages: state.messages.map((message) => message.id === id ? { ...message, text: message.text + text } : message),
      })),
      setActionId: (id, actionId) => set((state) => ({
        messages: state.messages.map((message) => message.id === id ? { ...message, actionId } : message),
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
      searchResults: (id, results) => set((state) => ({
        messages: state.messages.map((message) => message.id === id ? { ...message, searchResults: results } : message),
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
  recoverMessage: (id, recovery) => set((state) => ({
        messages: state.messages.map((message) => {
          if (message.id !== id) return message;
          const next: ChatMessage = { ...message };
          if ('text' in recovery) next.text = recovery.text ?? '';
          if ('thinking' in recovery) next.thinking = recovery.thinking ?? '';
          if ('citations' in recovery) next.citations = recovery.citations ?? [];
          if ('toolCalls' in recovery) next.toolCalls = recovery.toolCalls ?? [];
          if ('searchResults' in recovery) next.searchResults = recovery.searchResults ?? [];
          if ('insufficient' in recovery) next.insufficient = recovery.insufficient ?? false;
          // A successful recovery always clears the error; an explicit error
          // recovery (e.g. server says failed/cancelled) sets it.
          if (recovery.error !== undefined) {
            next.error = recovery.error;
          } else if (!recovery.insufficient) {
            next.error = undefined;
          }
          return next;
        }),
      })),
      newSession: () => set({ messages: [], sessionId: createChatSessionId() }),
      loadSession: ({ mode, question, answer, citations, insufficient }) => set({
        sessionId: createChatSessionId(),
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
      partialize: (state) => ({ sessionId: state.sessionId, mode: state.mode, messages: state.messages, open: state.open }),
    },
  ),
);
