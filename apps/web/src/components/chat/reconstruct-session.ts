import { isLegacyInsufficientWikiAnswer, type AiActionEvent, type AiCitation, type AiConversationDetail, type AiToolCallEventPayload } from '@next-wiki/shared';
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

export type RecoveredChatTurn = ReconstructedSession & {
  actionId: string;
  status: string;
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
 * wiki_question actions from `/api/ai/sessions/{key}`. Falls back to the
 * captured Raw conversation when the turn's events have already been purged at
 * the retention horizon. Returns null if the server rejected the lookup
 * (caller decides what to do with the persisted error in that case).
 */
export async function recoverSessionFromServer(actionId: string): Promise<(ReconstructedSession & { status: string }) | null> {
  try {
    // The conversation-detail endpoint keys conversations, not individual
    // action ids. A single uncaptured turn is keyed as `legacy:turn:{actionId}`,
    // and that is exactly the handle we persist for recovery — so the response
    // carries exactly this action's turn.
    const detail = await apiGet<AiConversationDetail>(`/api/ai/sessions/legacy:turn:${actionId}`);
    const turn = detail.turns[0];
    if (!turn) return null;
    const captured = detail.conversation.rawConversation?.conversation;
    const base = turn.events.length === 0 && captured
      ? {
          question: captured.question,
          answer: captured.answer,
          thinking: captured.thinking,
          citations: captured.citations,
          toolCalls: [] as AiToolCallEventPayload[],
          searchResults: [] as Array<{ title: string; path: string; spaceSlug?: string }>,
          insufficient: captured.insufficient,
          errorMessage: captured.errorMessage,
        }
      : reconstructSessionFromEvents(turn.events);
    return { ...base, status: turn.action.status };
  } catch {
    // Permission revoked / session expired / not found / network blip. The
    // caller (pane auto-recovery) treats null as "leave the persisted error
    // alone" and the message stays failed; the user can retry manually.
    return null;
  }
}

/**
 * Recover the newest server turn that belongs to a persisted browser chat
 * session. This closes the small but important gap before the browser receives
 * the POST response containing `actionId`: a navigation can detach that
 * response even though the action was accepted and queued successfully.
 *
 * Prefer the exact question match. A just-created queued action has not yet
 * emitted its `question` event, so its empty event log is a safe fallback for
 * this one-tab session, where the composer permits only one pending turn.
 */
export async function recoverLatestSessionTurnFromServer(
  sessionId: string,
  expectedQuestion: string,
): Promise<RecoveredChatTurn | null> {
  try {
    const detail = await apiGet<AiConversationDetail>(`/api/ai/sessions/legacy:${sessionId}`);
    const expected = expectedQuestion.trim();
    const reconstructed = detail.turns.map((turn) => ({
      turn,
      state: reconstructSessionFromEvents(turn.events),
    }));
    const match = reconstructed.find(({ turn, state }) => (
      (turn.action.status === 'queued' || turn.action.status === 'running') &&
      (state.question.trim() === expected || state.question.trim() === '')
    )) ?? reconstructed.find(({ state }) => state.question.trim() === expected);
    if (!match) return null;
    return {
      ...match.state,
      actionId: match.turn.action.id,
      status: match.turn.action.status,
    };
  } catch {
    return null;
  }
}
