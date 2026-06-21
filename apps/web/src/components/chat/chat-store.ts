'use client';

import { create } from 'zustand';
import type { AiCitation, AiQuestionMode } from '@next-wiki/shared';

export type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  citations?: AiCitation[];
  error?: string;
};

type ChatState = {
  mode: AiQuestionMode;
  messages: ChatMessage[];
  setMode: (mode: AiQuestionMode) => void;
  add: (message: ChatMessage) => void;
  append: (id: string, text: string) => void;
  citations: (id: string, citations: AiCitation[]) => void;
  fail: (id: string, error: string) => void;
};

export const useChatStore = create<ChatState>((set) => ({
  mode: 'retrieval',
  messages: [],
  setMode: (mode) => set({ mode }),
  add: (message) => set((state) => ({ messages: [...state.messages, message] })),
  append: (id, text) => set((state) => ({
    messages: state.messages.map((message) => message.id === id ? { ...message, text: message.text + text } : message),
  })),
  citations: (id, citations) => set((state) => ({
    messages: state.messages.map((message) => message.id === id ? { ...message, citations } : message),
  })),
  fail: (id, error) => set((state) => ({
    messages: state.messages.map((message) => message.id === id ? { ...message, error } : message),
  })),
}));
