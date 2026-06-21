'use client';

import { useAiAction } from './use-ai-action';
import { useChatStore } from '@/components/chat/chat-store';
import type { AiCitation, AiQuestionMode } from '@next-wiki/shared';

export function useAiChat(currentPage?: { pageId: string; revisionId: string }) {
  const store = useChatStore();
  const action = useAiAction();
  async function ask(question: string, mode: AiQuestionMode) {
    const userId = crypto.randomUUID();
    const assistantId = crypto.randomUUID();
    store.add({ id: userId, role: 'user', text: question });
    store.add({ id: assistantId, role: 'assistant', text: '' });
    try {
      await action.start('/api/ai/questions', { question, mode, currentPage }, (event) => {
        if (event.type === 'text_delta') store.append(assistantId, String(event.payload.text ?? ''));
        if (event.type === 'citations') store.citations(assistantId, (event.payload.citations ?? []) as AiCitation[]);
        if (event.type === 'error') store.fail(assistantId, String(event.payload.message ?? 'AI request failed'));
      });
    } catch (error) {
      store.fail(assistantId, String((error as { message?: string }).message ?? 'AI request failed'));
    }
  }
  return { ...store, ...action, ask };
}
