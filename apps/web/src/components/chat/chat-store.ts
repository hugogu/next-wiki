'use client';

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type {
  AiCitation,
  AiQuestionMode,
  ResearchMode,
  AiToolCallEventPayload,
  AiToolProposalEventPayload,
} from '@next-wiki/shared';
import { uuid } from '@/lib/uuid';

const sessionFallback = new Map<string, string>();

// Storage access itself can throw in a privacy-restricted browser. The active
// chat remains usable in memory; durable anonymous history is handled by the
// IndexedDB-backed anonymous-chat-history module.
const safeSessionStorage = {
  getItem: (key: string) => {
    try {
      return sessionStorage.getItem(key);
    } catch {
      return sessionFallback.get(key) ?? null;
    }
  },
  setItem: (key: string, value: string) => {
    sessionFallback.set(key, value);
    try {
      sessionStorage.setItem(key, value);
    } catch {
      // The in-memory fallback above keeps this page's active conversation.
    }
  },
  removeItem: (key: string) => {
    sessionFallback.delete(key);
    try {
      sessionStorage.removeItem(key);
    } catch {
      // Nothing else to clean up when browser storage is disabled.
    }
  },
};

export function createChatSessionId(): string {
  return uuid();
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
  /** True until this turn reaches a terminal action event or local start failure. */
  pending?: boolean;
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
  researchMode: ResearchMode;
  messages: ChatMessage[];
  open: boolean;
  latestQueuedAt?: string;
  /**
   * History key of the conversation currently loaded into the pane, or null for
   * a session that started here. Distinct from `sessionId` (which the server
   * groups new turns by): this is the address the pane publishes as `?chat=`,
   * so a conversation can be linked to rather than only living in this tab.
   */
  conversationKey: string | null;
  setMode: (mode: AiQuestionMode) => void;
  setResearchMode: (researchMode: ResearchMode) => void;
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
  setPending: (id: string, pending: boolean) => void;
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
      toolProposals?: AiToolProposalEventPayload[];
      searchResults?: ChatRetrievalResult[];
      error?: string;
      insufficient?: boolean;
      pending?: boolean;
    },
  ) => void;
  newSession: () => void;
  loadSession: (session: {
    sessionId?: string;
    mode: AiQuestionMode;
    question: string;
    answer: string;
    citations: AiCitation[];
    insufficient: boolean;
  }) => void;
  restoreSession: (session: {
    sessionId?: string;
    mode: AiQuestionMode;
    messages: ChatMessage[];
    latestQueuedAt?: string;
    conversationKey?: string | null;
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
      researchMode: 'wiki_only',
      messages: [],
      open: false,
      conversationKey: null,
      setMode: (mode) => set({ mode }),
      setResearchMode: (researchMode) => set({ researchMode }),
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
        messages: state.messages.map((message) => message.id === id ? { ...message, error, pending: false } : message),
      })),
      setPending: (id, pending) => set((state) => ({
        messages: state.messages.map((message) => message.id === id ? { ...message, pending } : message),
      })),
      recoverMessage: (id, recovery) => set((state) => ({
        messages: state.messages.map((message) => {
          if (message.id !== id) return message;
          const next: ChatMessage = { ...message };
          if ('text' in recovery) next.text = recovery.text ?? '';
          if ('thinking' in recovery) next.thinking = recovery.thinking ?? '';
          if ('citations' in recovery) next.citations = recovery.citations ?? [];
          if ('toolCalls' in recovery) next.toolCalls = recovery.toolCalls ?? [];
          if ('toolProposals' in recovery) next.toolProposals = recovery.toolProposals ?? [];
          if ('searchResults' in recovery) next.searchResults = recovery.searchResults ?? [];
          if ('insufficient' in recovery) next.insufficient = recovery.insufficient ?? false;
          if ('pending' in recovery) next.pending = recovery.pending ?? false;
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
      newSession: () => set({
        messages: [],
        sessionId: createChatSessionId(),
        latestQueuedAt: undefined,
        conversationKey: null,
      }),
      loadSession: ({ sessionId, mode, question, answer, citations, insufficient }) => set({
        sessionId: sessionId ?? createChatSessionId(),
        mode,
        open: true,
        conversationKey: null,
        messages: [
          { id: uuid(), role: 'user', text: question },
          { id: uuid(), role: 'assistant', text: answer, citations, insufficient },
        ],
      }),
      restoreSession: ({ sessionId, mode, messages, latestQueuedAt, conversationKey = null }) => set({
        sessionId: sessionId ?? createChatSessionId(),
        mode,
        open: true,
        messages,
        latestQueuedAt,
        conversationKey,
      }),
    }),
    {
      name: 'ai-chat',
      storage: createJSONStorage(() => safeSessionStorage),
      skipHydration: true,
      partialize: (state) => ({ sessionId: state.sessionId, mode: state.mode, messages: state.messages, open: state.open, latestQueuedAt: state.latestQueuedAt, conversationKey: state.conversationKey }),
    },
  ),
);
