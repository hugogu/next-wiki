import { isLegacyInsufficientWikiAnswer, type AiActionEvent, type AiCitation } from '@next-wiki/shared';
import { processTextDelta, flushStreamState, type StreamState } from '@/hooks/use-ai-chat';

export type ReconstructedSession = {
  question: string;
  answer: string;
  thinking: string;
  citations: AiCitation[];
  insufficient: boolean;
  errorMessage: string | null;
};

/**
 * Replays a session's stored event log through the same text/think splitter
 * `useAiChat` applies while streaming live, so a historical session renders
 * identically to one just answered. Events must be in ascending id order
 * (as returned by `getActionEvents`).
 */
export function reconstructSessionFromEvents(events: AiActionEvent[]): ReconstructedSession {
  const state: StreamState = { markerBuffer: '', tagBuffer: '', insideThink: false };
  let question = '';
  let answer = '';
  let thinking = '';
  let citations: AiCitation[] = [];
  let errorMessage: string | null = null;

  for (const event of events) {
    if (event.type === 'question') {
      question = String(event.payload.text ?? '');
    } else if (event.type === 'reasoning_delta') {
      thinking += String(event.payload.text ?? '');
    } else if (event.type === 'text_delta') {
      const { answerText, thinkingText } = processTextDelta(state, String(event.payload.text ?? ''));
      answer += answerText;
      thinking += thinkingText;
    } else if (event.type === 'citations') {
      citations = (event.payload.citations ?? []) as AiCitation[];
    } else if (event.type === 'error') {
      errorMessage = String(event.payload.message ?? 'AI request failed');
    }
  }
  const flushed = flushStreamState(state);
  answer += flushed.answerText;
  thinking += flushed.thinkingText;

  const insufficient = isLegacyInsufficientWikiAnswer(answer);
  return { question, answer: insufficient ? '' : answer, thinking, citations, insufficient, errorMessage };
}
