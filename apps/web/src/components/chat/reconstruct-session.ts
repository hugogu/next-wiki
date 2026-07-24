import { isLegacyInsufficientWikiAnswer, type AiActionEvent, type AiCitation, type AiToolCallEventPayload, type RawConversationPointer } from '@next-wiki/shared';
import { apiGet } from '@/lib/api/client';
import { processTextDelta, flushStreamState, type StreamState } from '@/hooks/use-ai-chat';

export type ReconstructedSession = {
  question: string;
  answer: string;
  thinking: string;
  citations: AiCitation[];
  toolCalls: AiToolCallEventPayload[];
  searchResults: Array<{ title: string; path: string; spaceSlug?: string }>;
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
  const toolCalls: AiToolCallEventPayload[] = [];
  const searchResults: Array<{ title: string; path: string; spaceSlug?: string }> = [];
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
    } else if (event.type === 'search_results') {
      const raw = Array.isArray(event.payload.results) ? event.payload.results : [];
      for (const item of raw) {
        const candidate = item as { title?: unknown; path?: unknown; spaceSlug?: unknown };
        if (typeof candidate.title === 'string' && typeof candidate.path === 'string') {
          searchResults.push({
            title: candidate.title,
            path: candidate.path,
            ...(typeof candidate.spaceSlug === 'string' ? { spaceSlug: candidate.spaceSlug } : {}),
          });
        }
      }
    } else if (event.type === 'tool_call') {
      const payload = event.payload as AiToolCallEventPayload;
      toolCalls.push(payload);
    } else if (event.type === 'error') {
      errorMessage = String(event.payload.message ?? 'AI request failed');
    }
  }
  const flushed = flushStreamState(state);
  answer += flushed.answerText;
  thinking += flushed.thinkingText;

  const insufficient = isLegacyInsufficientWikiAnswer(answer);
  return { question, answer: insufficient ? '' : answer, thinking, citations, toolCalls, searchResults, insufficient, errorMessage };
}

/**
 * Fetch the authoritative reconstructed state for one of the caller's own
 * wiki_question actions from `/api/ai/sessions/{actionId}`. Prefers the
 * captured Raw conversation (which outlives the event-log retention window)
 * over event reconstruction. Returns null if the server rejected the lookup
 * (caller decides what to do with the persisted error in that case).
 */
export async function recoverSessionFromServer(actionId: string): Promise<(ReconstructedSession & { status: string }) | null> {
  try {
    const { action, events, rawConversation } = await apiGet<{
      action: { status: string };
      events: AiActionEvent[];
      rawConversation: (RawConversationPointer & { conversation?: { question?: string; answer?: string; thinking?: string; citations?: AiCitation[]; insufficient?: boolean; errorMessage?: string | null } | null }) | null;
    }>(`/api/ai/sessions/${actionId}`);
    const captured = rawConversation?.conversation;
    const base = captured
      ? {
          question: captured.question ?? '',
          answer: captured.answer ?? '',
          thinking: captured.thinking ?? '',
          citations: captured.citations ?? [],
          toolCalls: [] as AiToolCallEventPayload[],
          searchResults: [] as Array<{ title: string; path: string; spaceSlug?: string }>,
          insufficient: captured.insufficient ?? false,
          errorMessage: captured.errorMessage ?? null,
        }
      : reconstructSessionFromEvents(events);
    return { ...base, status: action.status };
  } catch {
    // Permission revoked / session expired / not found / network blip. The
    // caller (pane auto-recovery) treats null as "leave the persisted error
    // alone" and the message stays failed; the user can retry manually.
    return null;
  }
}
