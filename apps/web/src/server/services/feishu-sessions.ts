import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';

/**
 * 025: Bot Session holds only Feishu-side lifecycle state — binding, chat,
 * the latest `ai_action_id`, the activity window, and `state`. Conversation
 * content (question/answer/citations/status) lives exclusively in
 * `ai_actions` / `ai_action_events` and the captured Raw Conversation page;
 * do NOT add timeline columns (question, answer, citations, error_message,
 * status, …) to `feishuBotSessions`. Multi-turn continuity is reconstructed
 * from `ai_actions.requestMetadata.feishuSessionId`, not from a second
 * parallel history table — see `getConversationContext` below and D3/D5 in
 * specs/025-feishu-bot-conversation-capture/plan.md.
 */

/** Conversation inactivity window bounds (minutes). */
export const SESSION_MIN_MINUTES = 5;
export const SESSION_MAX_MINUTES = 240;
export const SESSION_DEFAULT_MINUTES = 30;

/** Clamp/validate a configured session window to the supported range. */
export function validateSessionMinutes(minutes: number): number {
  if (
    !Number.isInteger(minutes) ||
    minutes < SESSION_MIN_MINUTES ||
    minutes > SESSION_MAX_MINUTES
  ) {
    throw new Error(
      `Session window must be an integer between ${SESSION_MIN_MINUTES} and ${SESSION_MAX_MINUTES} minutes`,
    );
  }
  return minutes;
}

/** Detect a "start a new conversation" command in the user's message. */
export function isResetCommand(text: string): boolean {
  const normalized = text.trim().toLowerCase();
  return (
    normalized === '/reset' ||
    normalized === 'reset' ||
    normalized === '新会话' ||
    normalized === '重置'
  );
}

export type ActiveSession = typeof schema.feishuBotSessions.$inferSelect;

export type ConversationTurn = { question: string; answer: string };

/** The active, unexpired session for a (binding, chat), if any. */
export async function getActiveSession(
  bindingId: string,
  chatId: string,
  now: Date = new Date(),
): Promise<ActiveSession | null> {
  const row = await db.query.feishuBotSessions.findFirst({
    where: and(
      eq(schema.feishuBotSessions.bindingId, bindingId),
      eq(schema.feishuBotSessions.chatId, chatId),
      eq(schema.feishuBotSessions.state, 'active'),
    ),
  });
  if (!row) return null;
  if (row.expiresAt <= now) {
    await db
      .update(schema.feishuBotSessions)
      .set({ state: 'expired' })
      .where(eq(schema.feishuBotSessions.id, row.id));
    return null;
  }
  return row;
}

/** Mark a (binding, chat)'s active session as reset (user asked for a new one). */
export async function resetSession(bindingId: string, chatId: string): Promise<void> {
  await db
    .update(schema.feishuBotSessions)
    .set({ state: 'reset' })
    .where(
      and(
        eq(schema.feishuBotSessions.bindingId, bindingId),
        eq(schema.feishuBotSessions.chatId, chatId),
        eq(schema.feishuBotSessions.state, 'active'),
      ),
    );
}

/** Return an existing active session or create a fresh one before an action is queued. */
export async function getOrCreateActiveSession(
  bindingId: string,
  chatId: string,
  now: Date = new Date(),
): Promise<ActiveSession> {
  const existing = await getActiveSession(bindingId, chatId, now);
  if (existing) return existing;

  const expiresAt = new Date(now.getTime() + SESSION_DEFAULT_MINUTES * 60 * 1000);
  const [created] = await db
    .insert(schema.feishuBotSessions)
    .values({ bindingId, chatId, state: 'active', lastActivityAt: now, expiresAt })
    .returning();
  return created!;
}

/** Attach a newly queued action to an existing conversation and refresh its window. */
export async function attachActionToSession(
  sessionId: string,
  actionId: string,
  now: Date = new Date(),
  windowMinutes = SESSION_DEFAULT_MINUTES,
): Promise<ActiveSession> {
  const minutes = validateSessionMinutes(windowMinutes);
  const [updated] = await db
    .update(schema.feishuBotSessions)
    .set({
      aiActionId: actionId,
      lastActivityAt: now,
      expiresAt: new Date(now.getTime() + minutes * 60 * 1000),
    })
    .where(
      and(eq(schema.feishuBotSessions.id, sessionId), eq(schema.feishuBotSessions.state, 'active')),
    )
    .returning();
  if (!updated) throw new Error('Feishu session is no longer active');
  return updated;
}

/**
 * Rebuild a bounded history from actions explicitly tagged with this server-side
 * session ID. It never reads other users' actions, including in shared chats.
 */
export async function getConversationContext(
  sessionId: string,
  userId: string,
): Promise<ConversationTurn[]> {
  const actions = await db
    .select({ id: schema.aiActions.id })
    .from(schema.aiActions)
    .where(
      and(
        inArray(schema.aiActions.feature, ['wiki_question', 'wiki_tool_chat']),
        eq(schema.aiActions.actorUserId, userId),
        sql`${schema.aiActions.requestMetadata} ->> 'feishuSessionId' = ${sessionId}`,
      ),
    )
    .orderBy(desc(schema.aiActions.queuedAt))
    .limit(6);
  if (actions.length === 0) return [];

  const events = await db
    .select({
      actionId: schema.aiActionEvents.actionId,
      type: schema.aiActionEvents.type,
      payload: schema.aiActionEvents.payload,
    })
    .from(schema.aiActionEvents)
    .where(
      inArray(
        schema.aiActionEvents.actionId,
        actions.map((action) => action.id),
      ),
    )
    .orderBy(asc(schema.aiActionEvents.id));
  const byAction = new Map<string, { question: string; answer: string }>();
  for (const event of events) {
    const turn = byAction.get(event.actionId) ?? { question: '', answer: '' };
    const payload = event.payload as { text?: string };
    if (event.type === 'question' && typeof payload.text === 'string')
      turn.question += payload.text;
    if (
      event.type === 'text_delta' &&
      typeof payload.text === 'string' &&
      payload.text !== 'INSUFFICIENT_WIKI_EVIDENCE'
    ) {
      turn.answer += payload.text;
    }
    byAction.set(event.actionId, turn);
  }
  return actions
    .reverse()
    .map((action) => byAction.get(action.id))
    .filter((turn): turn is ConversationTurn => Boolean(turn?.question))
    .map((turn) => ({
      question: turn.question.slice(0, 2_000),
      answer: turn.answer.slice(0, 4_000),
    }));
}

/**
 * Open or refresh the active session for a (binding, chat) and point it at the
 * latest AI action. There is at most one active session per (binding, chat), so
 * an existing one is refreshed rather than duplicated. A group session never
 * crosses users because it is keyed by the @-mentioner's binding.
 */
export async function upsertSession(input: {
  bindingId: string;
  chatId: string;
  aiActionId: string;
  windowMinutes?: number;
  now?: Date;
}): Promise<ActiveSession> {
  const now = input.now ?? new Date();
  const minutes = validateSessionMinutes(input.windowMinutes ?? SESSION_DEFAULT_MINUTES);
  const expiresAt = new Date(now.getTime() + minutes * 60 * 1000);

  const existing = await db.query.feishuBotSessions.findFirst({
    where: and(
      eq(schema.feishuBotSessions.bindingId, input.bindingId),
      eq(schema.feishuBotSessions.chatId, input.chatId),
      eq(schema.feishuBotSessions.state, 'active'),
    ),
  });
  if (existing) {
    const [updated] = await db
      .update(schema.feishuBotSessions)
      .set({ aiActionId: input.aiActionId, lastActivityAt: now, expiresAt })
      .where(eq(schema.feishuBotSessions.id, existing.id))
      .returning();
    return updated!;
  }
  const [created] = await db
    .insert(schema.feishuBotSessions)
    .values({
      bindingId: input.bindingId,
      chatId: input.chatId,
      aiActionId: input.aiActionId,
      state: 'active',
      lastActivityAt: now,
      expiresAt,
    })
    .returning();
  return created!;
}

/** Find the active session that owns a given AI action (for answer delivery). */
export async function getSessionByActionId(actionId: string): Promise<ActiveSession | null> {
  const action = await db.query.aiActions.findFirst({
    where: eq(schema.aiActions.id, actionId),
    columns: { requestMetadata: true },
  });
  const sessionId = (action?.requestMetadata as { feishuSessionId?: unknown } | null)
    ?.feishuSessionId;
  if (typeof sessionId === 'string') {
    const tagged = await db.query.feishuBotSessions.findFirst({
      where: and(
        eq(schema.feishuBotSessions.id, sessionId),
        eq(schema.feishuBotSessions.state, 'active'),
      ),
    });
    if (tagged) return tagged;
  }
  const row = await db.query.feishuBotSessions.findFirst({
    where: and(
      eq(schema.feishuBotSessions.aiActionId, actionId),
      eq(schema.feishuBotSessions.state, 'active'),
    ),
  });
  return row ?? null;
}
