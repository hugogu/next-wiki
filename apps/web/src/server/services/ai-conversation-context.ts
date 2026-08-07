import { and, asc, desc, eq, gt, inArray, lt, sql } from 'drizzle-orm';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';

export type WikiConversationTurn = { question: string; answer: string };

const MAX_CONVERSATION_TURNS = 6;

function bounded(value: string, limit: number): string {
  return value.trim().slice(0, limit);
}

/** A missing Markdown fence means this is a failed tool-protocol response, not
 * an answer that should be repeated to the model in the next turn. */
export function isBareToolProtocol(text: string): boolean {
  return /(?:^|\n)\s*tool_calls\s*:\s*\n\s*-\s*tool\s*:/i.test(text) ||
    /^\s*\{\s*"tool_calls"\s*:/i.test(text);
}

function failedTurnAnswer(status: string, error?: string | null): string {
  const detail = error ? ` Error: ${bounded(error, 500)}.` : '';
  return status === 'completed'
    ? `The previous assistant turn produced no usable final answer and may have attempted a Wiki tool call. Preserve and continue the user's underlying request rather than interpreting a short follow-up as a new topic.${detail}`
    : `The previous assistant turn did not complete. Preserve and retry or continue the user's underlying request rather than interpreting a short follow-up as a new topic.${detail}`;
}

export function buildConversationTurn(input: {
  question: string;
  answer?: string;
  status: string;
  error?: string | null;
}): WikiConversationTurn | null {
  const question = bounded(input.question, 2_000);
  if (!question) return null;
  const answer = bounded(input.answer ?? '', 4_000);
  return {
    question,
    answer: answer && !isBareToolProtocol(answer) ? answer : failedTurnAnswer(input.status, input.error),
  };
}

/**
 * Merge the browser's immediate state with the durable action-event history.
 * The latter is authoritative after reloads and interrupted streams; the former
 * covers a just-submitted turn whose worker has not emitted its question event.
 */
export function mergeConversationContext(
  persisted: WikiConversationTurn[],
  client: WikiConversationTurn[],
): WikiConversationTurn[] {
  const seen = new Set<string>();
  const merged: WikiConversationTurn[] = [];
  for (const turn of [...persisted, ...client]) {
    const normalized = buildConversationTurn({ ...turn, status: 'completed' });
    if (!normalized) continue;
    const key = `${normalized.question}\u0000${normalized.answer}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(normalized);
  }
  return merged.slice(-MAX_CONVERSATION_TURNS);
}

function eventText(payload: unknown, key: 'text' | 'message'): string | null {
  if (!payload || typeof payload !== 'object') return null;
  const value = (payload as Record<string, unknown>)[key];
  return typeof value === 'string' ? value : null;
}

/**
 * Reconstruct recent turns from durable event records for one browser chat
 * session. This deliberately runs in the worker, after the action is accepted,
 * so a browser refresh or a lost EventSource cannot make follow-up prompts lose
 * their context. Action inputs are intentionally deleted at completion, while
 * these bounded event records live for the configured conversation retention.
 */
export async function loadWebConversationContext(input: {
  actorUserId: string;
  queuedAt: Date;
  requestMetadata: unknown;
  clientConversation?: WikiConversationTurn[];
}): Promise<WikiConversationTurn[]> {
  const sessionId = (input.requestMetadata as { webSessionId?: unknown } | null)?.webSessionId;
  if (typeof sessionId !== 'string' || !sessionId) return input.clientConversation ?? [];

  const actions = await db
    .select({
      id: schema.aiActions.id,
      status: schema.aiActions.status,
      errorMessage: schema.aiActions.errorMessage,
    })
    .from(schema.aiActions)
    .where(
      and(
        eq(schema.aiActions.feature, 'wiki_question'),
        eq(schema.aiActions.actorUserId, input.actorUserId),
        lt(schema.aiActions.queuedAt, input.queuedAt),
        sql`(${schema.aiActions.requestMetadata} ->> 'webSessionId') = ${sessionId}`,
      ),
    )
    .orderBy(desc(schema.aiActions.queuedAt))
    .limit(MAX_CONVERSATION_TURNS);
  if (actions.length === 0) return input.clientConversation ?? [];

  const actionIds = actions.map((action) => action.id);
  const events = await db
    .select({
      actionId: schema.aiActionEvents.actionId,
      type: schema.aiActionEvents.type,
      payload: schema.aiActionEvents.payload,
    })
    .from(schema.aiActionEvents)
    .where(
      and(
        inArray(schema.aiActionEvents.actionId, actionIds),
        gt(schema.aiActionEvents.expiresAt, new Date()),
      ),
    )
    .orderBy(asc(schema.aiActionEvents.id));
  const eventsByAction = new Map<string, typeof events>();
  for (const event of events) {
    const grouped = eventsByAction.get(event.actionId) ?? [];
    grouped.push(event);
    eventsByAction.set(event.actionId, grouped);
  }

  const persisted = actions
    .reverse()
    .map((action) => {
      const actionEvents = eventsByAction.get(action.id) ?? [];
      const question = eventText(actionEvents.find((event) => event.type === 'question')?.payload, 'text');
      if (!question) return null;
      const answer = actionEvents
        .filter((event) => event.type === 'text_delta')
        .map((event) => eventText(event.payload, 'text'))
        .filter((text): text is string => typeof text === 'string')
        .join('');
      const eventError = eventText(actionEvents.find((event) => event.type === 'error')?.payload, 'message');
      return buildConversationTurn({
        question,
        answer,
        status: action.status,
        error: eventError ?? action.errorMessage,
      });
    })
    .filter((turn): turn is WikiConversationTurn => turn !== null);

  return mergeConversationContext(persisted, input.clientConversation ?? []);
}
