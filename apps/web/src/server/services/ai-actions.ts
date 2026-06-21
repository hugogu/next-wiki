import { and, asc, desc, eq, gt, inArray, isNull, lt } from 'drizzle-orm';
import type {
  AiActionAccepted,
  AiActionEvent,
  AiActionFeature,
  AiActionStatus,
  AiActionView,
  AiEventType,
  AiQuestionMode,
} from '@next-wiki/shared';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { env } from '@/server/config';
import { can, getActorUserId, type PermCtx } from '@/server/permissions';
import { DomainError } from '@/server/errors';
import { decryptAiJson, encryptAiJson, hashAiPayload } from '@/server/crypto/ai-encryption';
import { enqueue, QUEUES } from '@/server/jobs/runtime';

type CreateActionInput = {
  feature: AiActionFeature;
  input?: unknown;
  providerId?: string | null;
  modelId?: string | null;
  indexGenerationId?: string | null;
  pageId?: string | null;
  questionMode?: AiQuestionMode | null;
  requestMetadata?: Record<string, unknown>;
  allowWhenDisabled?: boolean;
};

function expiry(hours: number): Date {
  return new Date(Date.now() + hours * 60 * 60 * 1000);
}

export async function getAiSettings() {
  return (
    (await db.query.aiSettings.findFirst({ where: eq(schema.aiSettings.id, 'default') })) ?? {
      id: 'default',
      enabled: false,
      eventRetentionHours: env.AI_EVENT_RETENTION_HOURS,
      artifactRetentionHours: env.AI_ARTIFACT_RETENTION_HOURS,
      updatedBy: null,
      updatedAt: new Date(0),
    }
  );
}

export async function assertAiEnabled(): Promise<void> {
  if (!(await getAiSettings()).enabled) {
    throw new DomainError('AI_DISABLED', 'AI features are disabled');
  }
}

export async function createAction(ctx: PermCtx, input: CreateActionInput): Promise<AiActionAccepted> {
  const userId = getActorUserId(ctx);
  if (ctx.actor.kind !== 'user' || !userId) {
    throw new DomainError('UNAUTHORIZED', 'A signed-in user session is required');
  }
  if (!input.allowWhenDisabled) await assertAiEnabled();
  const settings = await getAiSettings();
  const expiresAt = expiry(settings.eventRetentionHours);
  const created = await db.transaction(async (tx) => {
    const [action] = await tx
      .insert(schema.aiActions)
      .values({
        feature: input.feature,
        actorUserId: userId,
        providerId: input.providerId ?? null,
        modelId: input.modelId ?? null,
        indexGenerationId: input.indexGenerationId ?? null,
        pageId: input.pageId ?? null,
        questionMode: input.questionMode ?? null,
        requestMetadata: input.requestMetadata ?? {},
        expiresAt,
      })
      .returning({ id: schema.aiActions.id });
    if (input.input !== undefined) {
      await tx.insert(schema.aiActionInputs).values({
        actionId: action!.id,
        payloadEncrypted: encryptAiJson(input.input),
        payloadHash: hashAiPayload(input.input),
        expiresAt,
      });
    }
    await tx.insert(schema.aiActionEvents).values({
      actionId: action!.id,
      type: 'status',
      payload: { status: 'queued' },
      expiresAt,
    });
    return action!;
  });
  await enqueue(QUEUES.aiAction, { actionId: created.id });
  return {
    id: created.id,
    feature: input.feature,
    status: 'queued',
    eventsUrl: `/api/ai/actions/${created.id}/events`,
  };
}

export async function readActionInput<T>(actionId: string): Promise<T | null> {
  const row = await db.query.aiActionInputs.findFirst({
    where: and(
      eq(schema.aiActionInputs.actionId, actionId),
      gt(schema.aiActionInputs.expiresAt, new Date()),
    ),
  });
  return row ? decryptAiJson<T>(row.payloadEncrypted) : null;
}

export async function deleteActionInput(actionId: string): Promise<void> {
  await db.delete(schema.aiActionInputs).where(eq(schema.aiActionInputs.actionId, actionId));
}

export async function appendActionEvent(
  actionId: string,
  type: AiEventType,
  payload: Record<string, unknown>,
): Promise<number> {
  const settings = await getAiSettings();
  const serialized = JSON.stringify(payload);
  if (Buffer.byteLength(serialized) > 128 * 1024) {
    throw new DomainError('INVALID_RESPONSE', 'AI event payload is too large');
  }
  const [row] = await db
    .insert(schema.aiActionEvents)
    .values({ actionId, type, payload, expiresAt: expiry(settings.eventRetentionHours) })
    .returning({ id: schema.aiActionEvents.id });
  return row!.id;
}

export async function getActionEvents(
  ctx: PermCtx,
  actionId: string,
  after = 0,
  limit = 100,
): Promise<AiActionEvent[]> {
  await requireActionAccess(ctx, actionId);
  const rows = await db
    .select()
    .from(schema.aiActionEvents)
    .where(
      and(
        eq(schema.aiActionEvents.actionId, actionId),
        gt(schema.aiActionEvents.id, after),
        gt(schema.aiActionEvents.expiresAt, new Date()),
      ),
    )
    .orderBy(asc(schema.aiActionEvents.id))
    .limit(limit);
  return rows.map((row) => ({
    id: row.id,
    actionId: row.actionId,
    type: row.type,
    payload: row.payload as Record<string, unknown>,
    createdAt: row.createdAt.toISOString(),
  }));
}

export async function requireActionAccess(ctx: PermCtx, actionId: string) {
  const row = await db.query.aiActions.findFirst({ where: eq(schema.aiActions.id, actionId) });
  if (!row) throw new DomainError('NOT_FOUND', 'AI action not found');
  const actorUserId = getActorUserId(ctx);
  if (
    ctx.actor.kind !== 'user' ||
    (row.actorUserId !== actorUserId && !can(ctx, 'manage_ai', { kind: 'ai_settings' }))
  ) {
    throw new DomainError('NOT_FOUND', 'AI action not found');
  }
  return row;
}

async function toView(row: typeof schema.aiActions.$inferSelect): Promise<AiActionView> {
  const [provider, model] = await Promise.all([
    row.providerId
      ? db.query.aiProviders.findFirst({ where: eq(schema.aiProviders.id, row.providerId) })
      : null,
    row.modelId ? db.query.aiModels.findFirst({ where: eq(schema.aiModels.id, row.modelId) }) : null,
  ]);
  return {
    id: row.id,
    feature: row.feature,
    status: row.status,
    actorUserId: row.actorUserId,
    providerId: row.providerId,
    providerName: provider?.name ?? null,
    modelId: row.modelId,
    modelName: model?.displayName ?? null,
    indexGenerationId: row.indexGenerationId,
    pageId: row.pageId,
    questionMode: row.questionMode,
    requestMetadata: row.requestMetadata as Record<string, unknown>,
    resultMetadata: row.resultMetadata as Record<string, unknown>,
    usageMetadata: row.usageMetadata as Record<string, unknown>,
    errorCode: row.errorCode,
    errorMessage: row.errorMessage,
    queuedAt: row.queuedAt.toISOString(),
    startedAt: row.startedAt?.toISOString() ?? null,
    finishedAt: row.finishedAt?.toISOString() ?? null,
    expiresAt: row.expiresAt.toISOString(),
  };
}

export async function getAction(ctx: PermCtx, actionId: string): Promise<AiActionView> {
  return toView(await requireActionAccess(ctx, actionId));
}

export async function listActions(
  ctx: PermCtx,
  filters: { feature?: AiActionFeature; status?: AiActionStatus; limit?: number } = {},
): Promise<AiActionView[]> {
  if (!can(ctx, 'manage_ai', { kind: 'ai_settings' })) {
    throw new DomainError('FORBIDDEN', 'You do not have permission to view AI actions');
  }
  const predicates = [];
  if (filters.feature) predicates.push(eq(schema.aiActions.feature, filters.feature));
  if (filters.status) predicates.push(eq(schema.aiActions.status, filters.status));
  const rows = await db
    .select()
    .from(schema.aiActions)
    .where(predicates.length ? and(...predicates) : undefined)
    .orderBy(desc(schema.aiActions.queuedAt))
    .limit(Math.min(filters.limit ?? 100, 200));
  return Promise.all(rows.map(toView));
}

export async function requestActionCancellation(ctx: PermCtx, actionId: string): Promise<AiActionView> {
  const row = await requireActionAccess(ctx, actionId);
  if (!['queued', 'running'].includes(row.status)) {
    throw new DomainError('CONFLICT', 'AI action is not cancellable');
  }
  const [updated] = await db
    .update(schema.aiActions)
    .set({ cancelRequested: true })
    .where(eq(schema.aiActions.id, actionId))
    .returning();
  return toView(updated!);
}

export async function startAction(actionId: string) {
  const [row] = await db
    .update(schema.aiActions)
    .set({ status: 'running', startedAt: new Date() })
    .where(and(eq(schema.aiActions.id, actionId), eq(schema.aiActions.status, 'queued')))
    .returning();
  if (row) await appendActionEvent(actionId, 'status', { status: 'running' });
  return row ?? null;
}

export async function finishAction(
  actionId: string,
  status: Extract<AiActionStatus, 'completed' | 'failed' | 'cancelled'>,
  details: {
    resultMetadata?: Record<string, unknown>;
    usageMetadata?: Record<string, unknown>;
    errorCode?: string | null;
    errorMessage?: string | null;
  } = {},
): Promise<void> {
  await db
    .update(schema.aiActions)
    .set({
      status,
      resultMetadata: details.resultMetadata ?? {},
      usageMetadata: details.usageMetadata ?? {},
      errorCode: details.errorCode ?? null,
      errorMessage: details.errorMessage?.slice(0, 500) ?? null,
      finishedAt: new Date(),
    })
    .where(eq(schema.aiActions.id, actionId));
  await appendActionEvent(
    actionId,
    status === 'completed' ? 'completed' : 'error',
    status === 'completed'
      ? { status }
      : { status, code: details.errorCode ?? status.toUpperCase(), message: details.errorMessage ?? status },
  );
  await deleteActionInput(actionId);
}

export async function isCancellationRequested(actionId: string): Promise<boolean> {
  const row = await db.query.aiActions.findFirst({ where: eq(schema.aiActions.id, actionId) });
  return !row || row.cancelRequested || row.status === 'cancelled';
}

export async function findRecoverableActionIds(): Promise<string[]> {
  const rows = await db
    .select({ id: schema.aiActions.id })
    .from(schema.aiActions)
    .where(
      and(
        inArray(schema.aiActions.status, ['queued', 'running']),
        gt(schema.aiActions.expiresAt, new Date()),
      ),
    );
  if (rows.length) {
    await db
      .update(schema.aiActions)
      .set({ status: 'queued', startedAt: null })
      .where(inArray(schema.aiActions.id, rows.map((row) => row.id)));
  }
  return rows.map((row) => row.id);
}

export async function cleanupExpiredAiData(): Promise<void> {
  const now = new Date();
  const supersededCutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  await db.delete(schema.aiActionEvents).where(lt(schema.aiActionEvents.expiresAt, now));
  await db.delete(schema.aiActionInputs).where(lt(schema.aiActionInputs.expiresAt, now));
  await db
    .update(schema.aiActions)
    .set({ status: 'expired' })
    .where(and(lt(schema.aiActions.expiresAt, now), inArray(schema.aiActions.status, ['completed', 'failed', 'cancelled'])));
  await db
    .delete(schema.aiGeneratedArtifacts)
    .where(
      and(
        lt(schema.aiGeneratedArtifacts.expiresAt, now),
        isNull(schema.aiGeneratedArtifacts.promotedAssetId),
      ),
    );
  await db
    .delete(schema.aiIndexGenerations)
    .where(
      and(
        eq(schema.aiIndexGenerations.status, 'superseded'),
        lt(schema.aiIndexGenerations.finishedAt, supersededCutoff),
      ),
    );
}
