'use client';

import { useRef } from 'react';
import { type AiClientEvent, useAiAction } from './use-ai-action';
import { type ChatMessage, useChatStore } from '@/components/chat/chat-store';
import {
  isLegacyInsufficientWikiAnswer,
  LEGACY_INSUFFICIENT_WIKI_EVIDENCE_MARKER,
  type AiActionAccepted,
  type AiCitation,
  type AiQuestionMode,
  type AiToolCallEventPayload,
  type AiToolProposalEventPayload,
} from '@next-wiki/shared';
import type { TranslationKey } from '@/i18n/keys';
import { useTranslation } from '@/i18n/client';

const THINK_OPEN = '<think>';
const THINK_CLOSE = '</think>';

export type StreamState = {
  markerBuffer: string;
  tagBuffer: string;
  insideThink: boolean;
  discardLegacyInsufficient?: boolean;
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

export function buildConversationContext(messages: ChatMessage[]): { question: string; answer: string }[] {
  const turns: { question: string; answer: string }[] = [];
  let pendingQuestion: string | null = null;
  for (const message of messages) {
    if (message.role === 'user') {
      pendingQuestion = message.text.trim().slice(0, 2_000);
      continue;
    }
    if (message.role === 'assistant' && pendingQuestion) {
      const answer = message.text.trim().slice(0, 4_000);
      if (answer) turns.push({ question: pendingQuestion, answer });
      pendingQuestion = null;
    }
  }
  return turns.slice(-6);
}

export function buildToolEnabledQuestionPayload(input: {
  question: string;
  mode: AiQuestionMode;
  sessionId: string;
  currentPage?: { pageId: string; revisionId: string };
  messages: ChatMessage[];
}) {
  return {
    question: input.question,
    mode: input.mode,
    sessionId: input.sessionId,
    currentPage: input.currentPage,
    conversation: buildConversationContext(input.messages),
    tools: { enabled: true, requestedReview: 'admin_review' as const },
  };
}

export function wikiAiErrorTranslationKey(error: {
  code?: unknown;
  message?: unknown;
}): TranslationKey {
  const code = typeof error.code === 'string' ? error.code : '';
  if (code === 'INVALID_RESPONSE') return 'ai.chat.errors.invalidResponse';
  if (code === 'PROVIDER_UNAVAILABLE') return 'ai.chat.errors.providerUnavailable';
  if (code === 'RATE_LIMITED') return 'ai.chat.errors.rateLimited';
  if (code === 'CANCELLED') return 'ai.chat.conversationView.responseStopped';
  if (code === 'NETWORK_ERROR') return 'ai.chat.errors.connectionFailed';
  if (code === 'UNAUTHORIZED') return 'ai.chat.errors.sessionExpired';
  if (code === 'BAD_REQUEST') return 'ai.chat.errors.invalidRequest';
  if (
    code === 'AI_DISABLED' ||
    code === 'AI_FEATURE_DISABLED' ||
    code === 'AI_NOT_CONFIGURED' ||
    code === 'MODEL_UNAVAILABLE' ||
    code === 'PROVIDER_DISABLED'
  ) {
    return 'ai.chat.errors.notAvailable';
  }
  return 'ai.chat.errors.requestFailed';
}

export async function startWikiQuestionAction(
  start: (
    path: string,
    input: ReturnType<typeof buildToolEnabledQuestionPayload>,
    onEvent: (event: AiClientEvent) => void,
  ) => Promise<AiActionAccepted>,
  payload: ReturnType<typeof buildToolEnabledQuestionPayload>,
  onEvent: (event: AiClientEvent) => void,
): Promise<AiActionAccepted> {
  try {
    return await start('/api/ai/questions', payload, onEvent);
  } catch (error) {
    // A reader view can retain page context that is no longer available.
    // Validation creates no action, so retrying without that optional context
    // cannot duplicate provider work.
    if ((error as { code?: unknown }).code !== 'NOT_FOUND' || !payload.currentPage) throw error;
    return start('/api/ai/questions', { ...payload, currentPage: undefined }, onEvent);
  }
}

export function useAiChat(currentPage?: { pageId: string; revisionId: string }) {
  const { t } = useTranslation();
  const store = useChatStore();
  const action = useAiAction();
  const stateRef = useRef<StreamState>({ markerBuffer: '', tagBuffer: '', insideThink: false });

  function emitAnswer(assistantId: string, text: string) {
    if (!text || stateRef.current.discardLegacyInsufficient) return;
    stateRef.current.markerBuffer += text;
    const trimmed = stateRef.current.markerBuffer.trimStart();
    if (isLegacyInsufficientWikiAnswer(trimmed)) {
      store.insufficient(assistantId);
      stateRef.current.markerBuffer = '';
      stateRef.current.discardLegacyInsufficient = true;
    } else if (LEGACY_INSUFFICIENT_WIKI_EVIDENCE_MARKER.startsWith(trimmed.trimEnd())) {
      // accumulating a possible marker; don't render yet
    } else {
      store.append(assistantId, stateRef.current.markerBuffer);
      stateRef.current.markerBuffer = '';
    }
  }

  async function ask(question: string, mode: AiQuestionMode) {
    const userId = crypto.randomUUID();
    const assistantId = crypto.randomUUID();
    stateRef.current = { markerBuffer: '', tagBuffer: '', insideThink: false, discardLegacyInsufficient: false };
    store.add({ id: userId, role: 'user', text: question });
    store.add({ id: assistantId, role: 'assistant', text: '' });

    const handleEvent = (event: AiClientEvent) => {
      if (event.type === 'reasoning_delta') {
        store.think(assistantId, String(event.payload.text ?? ''));
        return;
      }
      if (event.type === 'tool_call') {
        store.toolCall(assistantId, event.payload as AiToolCallEventPayload);
        return;
      }
      if (event.type === 'tool_proposal') {
        store.toolProposal(assistantId, event.payload as AiToolProposalEventPayload);
        return;
      }
      if (event.type === 'text_delta') {
        const { answerText, thinkingText } = processTextDelta(stateRef.current, String(event.payload.text ?? ''));
        if (thinkingText) store.think(assistantId, thinkingText);
        emitAnswer(assistantId, answerText);
      }
      if (event.type === 'citations') store.citations(assistantId, (event.payload.citations ?? []) as AiCitation[]);
      if (event.type === 'error') store.fail(assistantId, t(wikiAiErrorTranslationKey(event.payload)));
      if (event.type === 'completed' || event.type === 'error') {
        const { answerText, thinkingText } = flushStreamState(stateRef.current);
        if (thinkingText) store.think(assistantId, thinkingText);
        emitAnswer(assistantId, answerText);
        if (stateRef.current.markerBuffer) {
          store.append(assistantId, stateRef.current.markerBuffer);
          stateRef.current.markerBuffer = '';
        }
        stateRef.current = { markerBuffer: '', tagBuffer: '', insideThink: false, discardLegacyInsufficient: false };
      }
    };
    const payload = buildToolEnabledQuestionPayload({
      question,
      mode,
      sessionId: store.sessionId,
      currentPage,
      messages: store.messages,
    });

    try {
      await startWikiQuestionAction(action.start, payload, handleEvent);
    } catch (error) {
      store.fail(assistantId, t(wikiAiErrorTranslationKey(error as { code?: unknown; message?: unknown })));
    }
  }
  return { ...store, ...action, ask };
}
