'use client';

import { useRef } from 'react';
import { useAiAction } from './use-ai-action';
import { useChatStore } from '@/components/chat/chat-store';
import type { AiCitation, AiQuestionMode } from '@next-wiki/shared';

const INSUFFICIENT_MARKER = 'INSUFFICIENT_WIKI_EVIDENCE';
const THINK_OPEN = '<think>';
const THINK_CLOSE = '</think>';

export type StreamState = {
  markerBuffer: string;
  tagBuffer: string;
  insideThink: boolean;
};

/**
 * Splits a streamed text delta into answer text and thinking text.
 *
 * Tags can be split across chunks, so we hold back at most `tag.length - 1`
 * characters and prepend them to the next chunk. Everything else is emitted
 * immediately so both thinking and answer sections stream in real time.
 */
export function processTextDelta(state: StreamState, rawText: string): { answerText: string; thinkingText: string } {
  let chunk = state.tagBuffer + rawText;
  state.tagBuffer = '';

  let answerText = '';
  let thinkingText = '';

  while (chunk.length > 0) {
    if (state.insideThink) {
      const closeIndex = chunk.indexOf(THINK_CLOSE);
      if (closeIndex !== -1) {
        thinkingText += chunk.slice(0, closeIndex);
        state.insideThink = false;
        chunk = chunk.slice(closeIndex + THINK_CLOSE.length);
      } else {
        const holdBack = THINK_CLOSE.length - 1;
        if (chunk.length > holdBack) {
          thinkingText += chunk.slice(0, chunk.length - holdBack);
          state.tagBuffer = chunk.slice(chunk.length - holdBack);
        } else {
          state.tagBuffer = chunk;
        }
        break;
      }
    } else {
      const openIndex = chunk.indexOf(THINK_OPEN);
      if (openIndex !== -1) {
        answerText += chunk.slice(0, openIndex);
        state.insideThink = true;
        chunk = chunk.slice(openIndex + THINK_OPEN.length);
      } else {
        const holdBack = THINK_OPEN.length - 1;
        if (chunk.length > holdBack) {
          answerText += chunk.slice(0, chunk.length - holdBack);
          state.tagBuffer = chunk.slice(chunk.length - holdBack);
        } else {
          state.tagBuffer = chunk;
        }
        break;
      }
    }
  }

  return { answerText, thinkingText };
}

/** Flushes any held-back buffer when the stream ends. */
export function flushStreamState(state: StreamState): { answerText: string; thinkingText: string } {
  const buffer = state.tagBuffer;
  state.tagBuffer = '';
  if (!buffer) return { answerText: '', thinkingText: '' };
  return state.insideThink
    ? { answerText: '', thinkingText: buffer }
    : { answerText: buffer, thinkingText: '' };
}

export function useAiChat(currentPage?: { pageId: string; revisionId: string }) {
  const store = useChatStore();
  const action = useAiAction();
  const stateRef = useRef<StreamState>({ markerBuffer: '', tagBuffer: '', insideThink: false });

  function emitAnswer(assistantId: string, text: string) {
    if (!text) return;
    stateRef.current.markerBuffer += text;
    const trimmed = stateRef.current.markerBuffer.trim();
    if (trimmed === INSUFFICIENT_MARKER) {
      store.insufficient(assistantId);
      stateRef.current.markerBuffer = '';
    } else if (INSUFFICIENT_MARKER.startsWith(trimmed)) {
      // accumulating a possible marker; don't render yet
    } else {
      store.append(assistantId, stateRef.current.markerBuffer);
      stateRef.current.markerBuffer = '';
    }
  }

  async function ask(question: string, mode: AiQuestionMode) {
    const userId = crypto.randomUUID();
    const assistantId = crypto.randomUUID();
    stateRef.current = { markerBuffer: '', tagBuffer: '', insideThink: false };
    store.add({ id: userId, role: 'user', text: question });
    store.add({ id: assistantId, role: 'assistant', text: '' });

    try {
      await action.start('/api/ai/questions', { question, mode, currentPage }, (event) => {
        if (event.type === 'reasoning_delta') {
          store.think(assistantId, String(event.payload.text ?? ''));
          return;
        }
        if (event.type === 'text_delta') {
          const { answerText, thinkingText } = processTextDelta(stateRef.current, String(event.payload.text ?? ''));
          if (thinkingText) store.think(assistantId, thinkingText);
          emitAnswer(assistantId, answerText);
        }
        if (event.type === 'citations') store.citations(assistantId, (event.payload.citations ?? []) as AiCitation[]);
        if (event.type === 'error') store.fail(assistantId, String(event.payload.message ?? 'AI request failed'));
        if (event.type === 'completed' || event.type === 'error') {
          const { answerText, thinkingText } = flushStreamState(stateRef.current);
          if (thinkingText) store.think(assistantId, thinkingText);
          emitAnswer(assistantId, answerText);
          if (stateRef.current.markerBuffer) {
            store.append(assistantId, stateRef.current.markerBuffer);
            stateRef.current.markerBuffer = '';
          }
          stateRef.current = { markerBuffer: '', tagBuffer: '', insideThink: false };
        }
      });
    } catch (error) {
      store.fail(assistantId, String((error as { message?: string }).message ?? 'AI request failed'));
    }
  }
  return { ...store, ...action, ask };
}
