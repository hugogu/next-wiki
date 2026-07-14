import { and, asc, desc, eq, inArray, isNotNull, isNull, or, sql } from 'drizzle-orm';
import type { AiCitation } from '@next-wiki/shared';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { env } from '@/server/config';
import { enqueue, QUEUES } from '@/server/jobs/runtime';
import { getSessionByActionId } from './feishu-sessions';
import type { ProcessingReaction } from '@/server/feishu/transport-types';

/** Default retention for delivery rows (hours). Matches config default. */
const DEFAULT_RETENTION_HOURS = 72;

export type ReconstructedAnswer = {
  status: 'completed' | 'insufficient_evidence' | 'unavailable';
  text: string;
  citations: { title: string; url: string }[];
};

/** Read the persisted reaction that signals a Feishu question is in progress. */
export async function getProcessingReaction(actionId: string): Promise<ProcessingReaction | null> {
  const action = await db.query.aiActions.findFirst({
    where: eq(schema.aiActions.id, actionId),
    columns: { requestMetadata: true },
  });
  const reaction = (action?.requestMetadata as { feishuProcessingReaction?: unknown } | null)
    ?.feishuProcessingReaction;
  if (
    !reaction ||
    typeof reaction !== 'object' ||
    typeof (reaction as ProcessingReaction).messageId !== 'string' ||
    typeof (reaction as ProcessingReaction).reactionId !== 'string'
  ) {
    return null;
  }
  return reaction as ProcessingReaction;
}

function citationUrl(citation: AiCitation): string {
  const path = citation.path.replace(/^\/+/, '');
  return `${env.APP_URL}/${path}`;
}

export function toFeishuCitations(
  citations: AiCitation[],
): { title: string; url: string }[] {
  return citations.map((citation) => ({ title: citation.title, url: citationUrl(citation) }));
}

function hasFeishuStreamingAnswer(requestMetadata: unknown): boolean {
  return (requestMetadata as { feishuStreamingAnswer?: unknown } | null)?.feishuStreamingAnswer === true;
}

/**
 * Reconstruct a bot-safe answer from a completed `wiki_question` action's event
 * stream. Never returns raw prompts — only the produced answer text and the
 * sanitized citation titles/links.
 */
export async function reconstructAnswer(actionId: string): Promise<ReconstructedAnswer> {
  const action = await db.query.aiActions.findFirst({
    where: eq(schema.aiActions.id, actionId),
    columns: { status: true, resultMetadata: true },
  });
  if (!action || action.status !== 'completed') {
    return { status: 'unavailable', text: '', citations: [] };
  }
  const meta = (action.resultMetadata ?? {}) as { insufficientEvidence?: boolean };
  if (meta.insufficientEvidence) {
    return { status: 'insufficient_evidence', text: '', citations: [] };
  }

  const events = await db
    .select({ type: schema.aiActionEvents.type, payload: schema.aiActionEvents.payload })
    .from(schema.aiActionEvents)
    .where(eq(schema.aiActionEvents.actionId, actionId))
    .orderBy(asc(schema.aiActionEvents.id));

  let text = '';
  let citations: { title: string; url: string }[] = [];
  for (const ev of events) {
    if (ev.type === 'text_delta') {
      const p = ev.payload as { text?: string };
      if (typeof p.text === 'string' && p.text !== 'INSUFFICIENT_WIKI_EVIDENCE') text += p.text;
    } else if (ev.type === 'citations') {
      const p = ev.payload as { citations?: AiCitation[] };
      if (Array.isArray(p.citations)) {
        citations = toFeishuCitations(p.citations);
      }
    }
  }
  return { status: 'completed', text: text.trim(), citations };
}

/**
 * Create a durable answer-delivery row for a completed Feishu-originated
 * question, if one is owned by a Feishu session. Idempotent: the answer-unique
 * index guarantees a single delivery per action. Returns the delivery id, or
 * null when the action is not a Feishu question or its binding is no longer
 * active (permission recheck at creation; the worker rechecks again at send).
 */
export async function createAnswerDelivery(
  actionId: string,
  now: Date = new Date(),
): Promise<string | null> {
  const action = await db.query.aiActions.findFirst({
    where: eq(schema.aiActions.id, actionId),
    columns: { requestMetadata: true },
  });
  if (hasFeishuStreamingAnswer(action?.requestMetadata)) return null;

  const session = await getSessionByActionId(actionId);
  if (!session) return null;

  const binding = await db.query.feishuBindings.findFirst({
    where: and(
      eq(schema.feishuBindings.id, session.bindingId),
      eq(schema.feishuBindings.status, 'active'),
    ),
    with: { user: { columns: { status: true } } },
  });
  if (!binding || binding.user?.status !== 'active') return null;

  const expiresAt = new Date(now.getTime() + DEFAULT_RETENTION_HOURS * 60 * 60 * 1000);
  const [row] = await db
    .insert(schema.feishuNotificationDeliveries)
    .values({
      aiActionId: actionId,
      recipientBindingId: binding.id,
      targetOpenId: binding.openId,
      status: 'queued',
      availableAt: now,
      expiresAt,
    })
    .onConflictDoNothing({
      target: schema.feishuNotificationDeliveries.aiActionId,
      // `answerUnique` is a partial index, so PostgreSQL requires its predicate
      // to be repeated in the conflict target.
      where: sql`${schema.feishuNotificationDeliveries.aiActionId} is not null`,
    })
    .returning({ id: schema.feishuNotificationDeliveries.id });
  return row?.id ?? null;
}

/**
 * Reconcile Feishu-owned questions that have reached a terminal state but have
 * no answer delivery yet, creating one for each. This covers every terminal
 * outcome (completed, insufficient, failed, cancelled, expired) and is
 * idempotent via the answer-unique index — so a missed prompt hook or a crash
 * never drops a user's answer.
 */
export async function createPendingAnswerDeliveries(now: Date = new Date()): Promise<number> {
  const TERMINAL = ['completed', 'failed', 'cancelled', 'expired'] as const;
  const candidates = await db
    .select({ actionId: schema.aiActions.id, requestMetadata: schema.aiActions.requestMetadata })
    .from(schema.feishuBotSessions)
    .innerJoin(
      schema.aiActions,
      or(
        eq(schema.aiActions.id, schema.feishuBotSessions.aiActionId),
        sql`${schema.aiActions.requestMetadata} ->> 'feishuSessionId' = ${schema.feishuBotSessions.id}::text`,
      ),
    )
    .leftJoin(
      schema.feishuNotificationDeliveries,
      eq(schema.feishuNotificationDeliveries.aiActionId, schema.feishuBotSessions.aiActionId),
    )
    .where(
      and(
        isNotNull(schema.feishuBotSessions.aiActionId),
        eq(schema.feishuBotSessions.state, 'active'),
        inArray(schema.aiActions.status, [...TERMINAL]),
        isNull(schema.feishuNotificationDeliveries.id),
      ),
    );

  let created = 0;
  const seen = new Set<string>();
  for (const row of candidates) {
    if (!row.actionId || seen.has(row.actionId) || hasFeishuStreamingAnswer(row.requestMetadata)) continue;
    seen.add(row.actionId);
    const id = await createAnswerDelivery(row.actionId, now);
    if (id) created += 1;
  }
  return created;
}

/**
 * If a finished action belongs to a Feishu session, wake the delivery worker so
 * the answer is sent promptly instead of waiting for the next scheduled tick.
 * A no-op (safe) when the worker/queue is unavailable or the action is not a
 * Feishu question.
 */
export async function nudgeAnswerDelivery(actionId: string): Promise<void> {
  const session = await getSessionByActionId(actionId);
  if (session) await enqueue(QUEUES.feishuDelivery, {});
}

/** Latest citations event for tests/inspection (non-secret). */
export async function latestCitations(actionId: string): Promise<AiCitation[]> {
  const [ev] = await db
    .select({ payload: schema.aiActionEvents.payload })
    .from(schema.aiActionEvents)
    .where(
      and(
        eq(schema.aiActionEvents.actionId, actionId),
        eq(schema.aiActionEvents.type, 'citations'),
      ),
    )
    .orderBy(desc(schema.aiActionEvents.id))
    .limit(1);
  const p = (ev?.payload ?? {}) as { citations?: AiCitation[] };
  return p.citations ?? [];
}
