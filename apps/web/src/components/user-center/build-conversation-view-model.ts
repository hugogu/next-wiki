import type { AiConversationDetail, ConversationSessionViewModel } from '@next-wiki/shared';
import { reconstructSessionFromEvents } from '@/components/chat/reconstruct-session';

/**
 * Convert the server conversation detail (turns newest-first) into a view model
 * that renders oldest-first like the live chat pane. The top-level turn fields
 * are kept as the latest turn for callers that only render a single turn.
 */
export function buildConversationViewModel(detail: AiConversationDetail): ConversationSessionViewModel {
  const turns = detail.turns
    .map((turn) => {
      const reconstructed = reconstructSessionFromEvents(turn.events);
      return {
        status: turn.action.status,
        question: reconstructed.question,
        answer: reconstructed.answer,
        thinking: reconstructed.thinking,
        citations: reconstructed.citations,
        toolCalls: reconstructed.toolCalls as never,
        insufficient: reconstructed.insufficient,
        errorMessage: reconstructed.errorMessage,
        queuedAt: turn.action.queuedAt,
        startedAt: turn.action.startedAt,
        finishedAt: turn.action.finishedAt,
      };
    })
    .reverse();
  // The server returns turns newest-first, but the chat UI expects oldest-first.
  const latest = turns.at(-1);
  if (!latest) throw new Error('Conversation detail returned zero turns');
  return { ...latest, turns };
}
