'use client';

import type {
  AiConversationDetail,
  ConversationSessionTurn,
  ConversationSessionViewModel,
} from '@next-wiki/shared';
import { fetchHistoryDetail } from './history-api';
import {
  reconstructSessionFromEvents,
  type ReconstructedSession,
} from './reconstruct-session';
import { resolveSessionId } from './resolve-session-id';
import { listAnonymousChatSessions } from './anonymous-chat-history';
import { useChatStore } from './chat-store';
import { uuid } from '@/lib/uuid';

type ChatMessages = ReturnType<typeof useChatStore.getState>['messages'];

function pushTurn(messages: ChatMessages, turn: ReconstructedSession) {
  messages.push({
    id: uuid(),
    role: 'user',
    text: turn.question,
  });
  messages.push({
    id: uuid(),
    role: 'assistant',
    text: turn.insufficient ? '' : turn.answer,
    thinking: turn.thinking,
    citations: turn.citations,
    toolCalls: turn.toolCalls,
    searchResults: turn.searchResults,
    insufficient: turn.insufficient,
    error: turn.errorMessage ?? undefined,
  });
}

/**
 * Turns of a captured conversation as the chat renders them. The Raw snapshot
 * records the transcript, not the governed tool-call timeline (no call ids or
 * review decisions), so those stay empty rather than being invented; the Raw
 * page linked from the pointer still shows them in full.
 */
function turnsFromSnapshot(snapshot: ConversationSessionViewModel): ReconstructedSession[] {
  const turns: ConversationSessionTurn[] = snapshot.turns ?? [snapshot];
  return turns.map((turn) => ({
    question: turn.question,
    answer: turn.answer,
    thinking: turn.thinking,
    citations: turn.citations,
    toolCalls: [],
    searchResults: [],
    insufficient: turn.insufficient,
    errorMessage: turn.errorMessage,
  }));
}

/**
 * Rebuilds the in-memory chat message list from a server-side conversation
 * detail. Reused by the pane's "loading from history" path and by tests.
 *
 * Server returns turns newest-first; this returns messages oldest-first so the
 * pane can render them in order. When the live event log has been purged by
 * retention, fall back to the captured Raw snapshot wholesale — capture groups
 * a session by its own scope and the two turn lists need not line up one for
 * one.
 */
export function buildMessagesFromDetail(detail: AiConversationDetail): ChatMessages {
  const messages: ChatMessages = [];
  const turns = [...detail.turns].reverse();
  const snapshot = detail.conversation.rawConversation?.conversation;
  if (snapshot && turns.every((turn) => turn.events.length === 0)) {
    for (const turn of turnsFromSnapshot(snapshot)) pushTurn(messages, turn);
    return messages;
  }
  for (const turn of turns) pushTurn(messages, reconstructSessionFromEvents(turn.events));
  return messages;
}

/**
 * Loads a historical conversation into the active chat store. Replaces any
 * current session and opens the pane. Resolves a session id compatible with
 * the server's grouping rule (original `webSessionId` when known, fresh UUID
 * otherwise) so subsequent turns continue the same conversation rather than
 * starting a new one.
 *
 * The history key is carried into the store as `conversationKey`, which the
 * pane publishes as `?chat=` — one place decides what is loaded, so every
 * caller (history click, restoring a shared link) lands on the same address.
 *
 * Returns whether the key resolved, so a caller restoring a link can fall back
 * to another store rather than assume the address is dead.
 */
export async function loadConversationFromKey(key: string): Promise<boolean> {
  const detail = await fetchHistoryDetail(key);
  if (!detail) return false;
  const messages = buildMessagesFromDetail(detail);
  useChatStore.getState().restoreSession({
    sessionId: resolveSessionId(detail.conversation, detail),
    mode: detail.turns.at(-1)?.action.questionMode ?? 'retrieval',
    messages,
    latestQueuedAt: detail.conversation.latestQueuedAt,
    conversationKey: key,
  });
  return true;
}

async function restoreLocalConversation(key: string): Promise<boolean> {
  const session = (await listAnonymousChatSessions()).find((item) => item.sessionId === key);
  if (!session) return false;
  useChatStore.getState().restoreSession({ ...session, conversationKey: key });
  return true;
}

/**
 * Load a linked conversation from whichever store holds it.
 *
 * A key is looked for in the account's server history and in this browser's
 * anonymous history, most-likely first — the actor only decides the order, not
 * which stores are consulted. Identity is not settled when this runs: a
 * staticPublic document renders against an anonymous placeholder and only
 * hydrates its real visitor afterwards, so trusting `anonymous` outright would
 * declare a perfectly good server conversation dead and drop its address.
 */
export async function restoreLinkedConversation(
  key: string,
  anonymous: boolean,
  cancelled: () => boolean = () => false,
): Promise<boolean> {
  const attempts = anonymous
    ? [restoreLocalConversation, loadConversationFromKey]
    : [loadConversationFromKey, restoreLocalConversation];
  for (const attempt of attempts) {
    if (cancelled()) return false;
    if (await attempt(key)) return true;
  }
  return false;
}
