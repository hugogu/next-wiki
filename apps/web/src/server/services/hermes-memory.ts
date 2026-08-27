import { randomUUID } from 'node:crypto';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { readMarkdownWithFallback } from '@/server/content-store/read-router';
import { DomainError } from '@/server/errors';
import type { PermCtx } from '@/server/permissions';
import { requireHermesMemoryAccess, type HermesMemoryAccess } from '@/server/permissions/hermes-memory';
import * as pageService from '@/server/services/pages';
import { canonicalSpacePath } from '@/server/services/space-routes';
import { resolveSpace } from '@/server/services/spaces';
import { mergeSupportedMetadata } from '@/server/metadata/frontmatter';
import { env } from '@/server/config';
import { enqueue, QUEUES } from '@/server/jobs/runtime';
import type { ApiKeyScope, HermesMemoryEvidenceInput, HermesMemoryRecord, HermesMemorySaveInput } from '@next-wiki/shared';

const MEMORY_PAGE_PREFIX = 'hermes-memory';
const MAX_EXCERPT_LENGTH = 1_200;

type MemoryRecordRow = typeof schema.hermesMemoryRecords.$inferSelect;
type EvidenceRelation = 'explicit_save' | 'automatic_capture' | 'checkpoint';

function memoryPageContext(ctx: PermCtx): PermCtx {
  if (ctx.actor.kind !== 'api_key') {
    throw new DomainError('UNAUTHORIZED', 'A dedicated Hermes memory API key is required');
  }
  // The public key never has generic page scopes. This private adapter reaches
  // the ordinary page/revision lifecycle only after destination scope checks.
  const scopes = Array.from(new Set<ApiKeyScope>([
    ...ctx.actor.scopes,
    'view',
    'create',
    'edit',
    'delete',
  ]));
  return { actor: { ...ctx.actor, scopes } };
}

function memoryPath(namespaceId: string, recordId: string): string {
  return `${MEMORY_PAGE_PREFIX}/${namespaceId}/${recordId}`;
}

function excerpt(content: string): string {
  return content.replace(/^---[\s\S]*?---\s*/u, '').replace(/\s+/gu, ' ').trim().slice(0, MAX_EXCERPT_LENGTH);
}

function lexicalScore(query: string, content: string, title: string): number {
  const terms = query.toLocaleLowerCase().split(/[^\p{L}\p{N}_-]+/u).filter((term) => term.length > 1);
  if (terms.length === 0) return 0;
  const haystack = `${title}\n${content}`.toLocaleLowerCase();
  return terms.reduce((score, term) => score + (haystack.includes(term) ? 1 : 0), 0) / terms.length;
}

async function recordToView(record: MemoryRecordRow): Promise<HermesMemoryRecord | null> {
  if (record.state !== 'active') return null;
  const [page, revision, space] = await Promise.all([
    db.query.pages.findFirst({ where: and(eq(schema.pages.id, record.pageId), isNull(schema.pages.deletedAt)) }),
    db.query.pageRevisions.findFirst({ where: eq(schema.pageRevisions.id, record.currentRevisionId) }),
    resolveSpace(),
  ]);
  if (!page || !revision || !space || page.visibility !== 'restricted') return null;
  const source = await readMarkdownWithFallback(revision);
  const evidenceLinks = record.recordType === 'memory'
    ? await db.query.hermesMemoryEvidenceLinks.findMany({
        where: eq(schema.hermesMemoryEvidenceLinks.memoryRecordId, record.id),
        with: { evidence: true },
      })
    : [];
  const evidence = [] as HermesMemoryRecord['evidence'];
  for (const link of evidenceLinks) {
    const evidenceRecord = link.evidence;
    if (evidenceRecord.namespaceId !== record.namespaceId || evidenceRecord.state !== 'active') continue;
    const [evidencePage, evidenceRevision] = await Promise.all([
      db.query.pages.findFirst({ where: and(eq(schema.pages.id, evidenceRecord.pageId), isNull(schema.pages.deletedAt)) }),
      db.query.pageRevisions.findFirst({ where: eq(schema.pageRevisions.id, evidenceRecord.currentRevisionId) }),
    ]);
    if (!evidencePage || !evidenceRevision || evidencePage.visibility !== 'restricted') continue;
    evidence.push({
      evidenceId: evidenceRecord.id,
      relation: link.relation,
      citation: citation(evidencePage, evidenceRevision, space),
    });
  }

  return {
    memoryId: record.id,
    type: record.recordType,
    state: record.state,
    title: page.title,
    excerpt: excerpt(source),
    citation: citation(page, revision, space),
    evidence,
  };
}

function citation(
  page: typeof schema.pages.$inferSelect,
  revision: typeof schema.pageRevisions.$inferSelect,
  space: NonNullable<Awaited<ReturnType<typeof resolveSpace>>>,
) {
  const path = canonicalSpacePath(space, page.slug);
  return {
    pageId: page.id,
    revisionId: revision.id,
    revisionHash: revision.contentHash,
    title: page.title,
    canonicalUrl: new URL(path, env.APP_URL).toString(),
    createdAt: revision.createdAt.toISOString(),
  };
}

async function existingByIdempotency(namespaceId: string, idempotencyKey: string): Promise<MemoryRecordRow | null> {
  return (await db.query.hermesMemoryRecords.findFirst({
    where: and(
      eq(schema.hermesMemoryRecords.namespaceId, namespaceId),
      eq(schema.hermesMemoryRecords.idempotencyKey, idempotencyKey),
    ),
  })) ?? null;
}

async function assertMatchingIdempotentRecord(
  existing: MemoryRecordRow,
  input: { type: 'memory' | 'evidence'; title: string; content: string },
): Promise<void> {
  const [page, revision] = await Promise.all([
    db.query.pages.findFirst({ where: eq(schema.pages.id, existing.pageId) }),
    db.query.pageRevisions.findFirst({ where: eq(schema.pageRevisions.id, existing.currentRevisionId) }),
  ]);
  if (!page || !revision || existing.recordType !== input.type || page.title !== input.title) {
    throw new DomainError('CONFLICT', 'The idempotency key is already associated with different memory content');
  }
  const source = await readMarkdownWithFallback(revision);
  if (source !== input.content) {
    throw new DomainError('CONFLICT', 'The idempotency key is already associated with different memory content');
  }
}

async function assertEvidenceIds(namespaceId: string, evidenceIds: string[] | undefined): Promise<void> {
  if (!evidenceIds?.length) return;
  const records = await db.query.hermesMemoryRecords.findMany({
    where: and(
      eq(schema.hermesMemoryRecords.namespaceId, namespaceId),
      inArray(schema.hermesMemoryRecords.id, evidenceIds),
      eq(schema.hermesMemoryRecords.recordType, 'evidence'),
      eq(schema.hermesMemoryRecords.state, 'active'),
    ),
    columns: { id: true },
  });
  if (records.length !== new Set(evidenceIds).size) {
    throw new DomainError('HERMES_MEMORY_RECORD_NOT_FOUND', 'One or more evidence records are unavailable');
  }
}

async function createRecord(
  ctx: PermCtx,
  access: HermesMemoryAccess,
  input: {
    type: 'memory' | 'evidence';
    idempotencyKey: string;
    title: string;
    content: string;
    sourceSessionDigest?: string;
    evidenceIds?: string[];
    relation?: EvidenceRelation;
  },
): Promise<{ record: HermesMemoryRecord; idempotent: boolean }> {
  const existing = await existingByIdempotency(access.namespaceId, input.idempotencyKey);
  if (existing) {
    await assertMatchingIdempotentRecord(existing, input);
    const view = await recordToView(existing);
    if (!view) throw new DomainError('HERMES_MEMORY_RECORD_NOT_FOUND', 'The existing memory record is unavailable');
    return { record: view, idempotent: true };
  }
  await assertEvidenceIds(access.namespaceId, input.evidenceIds);

  const recordId = randomUUID();
  const page = await pageService.create(memoryPageContext(ctx), {
    path: memoryPath(access.namespaceId, recordId),
    title: input.title,
    contentSource: input.content,
    nature: 'original',
    visibility: 'restricted',
  });

  try {
    const [record] = await db
      .insert(schema.hermesMemoryRecords)
      .values({
        id: recordId,
        namespaceId: access.namespaceId,
        recordType: input.type,
        pageId: page.pageId,
        currentRevisionId: page.versionId,
        idempotencyKey: input.idempotencyKey,
        sourceSessionDigest: input.sourceSessionDigest ?? null,
      })
      .returning();
    if (!record) throw new Error('HERMES_MEMORY_RECORD_INSERT_FAILED');
    if (input.type === 'memory' && input.evidenceIds?.length) {
      await db.insert(schema.hermesMemoryEvidenceLinks).values(
        input.evidenceIds.map((evidenceRecordId) => ({
          memoryRecordId: record.id,
          evidenceRecordId,
          relation: input.relation ?? 'explicit_save',
        })),
      );
    }
    const view = await recordToView(record);
    if (!view) throw new Error('HERMES_MEMORY_RECORD_NOT_VISIBLE');
    return { record: view, idempotent: false };
  } catch (error) {
    // A simultaneous retry may win the destination/idempotency unique index.
    // Clean up this otherwise-unreferenced private page through normal delete.
    await pageService.remove(memoryPageContext(ctx), memoryPath(access.namespaceId, recordId)).catch(() => undefined);
    const winner = await existingByIdempotency(access.namespaceId, input.idempotencyKey);
    if (winner) {
      await assertMatchingIdempotentRecord(winner, input);
      const view = await recordToView(winner);
      if (view) return { record: view, idempotent: true };
    }
    throw error;
  }
}

export async function getConnection(ctx: PermCtx): Promise<{
  apiVersion: 'v1';
  provider: 'next-wiki';
  namespace: { id: string; displayName: string; state: 'active' };
  capabilities: { recall: boolean; save: boolean; forget: boolean; asynchronousEvidenceCapture: boolean; strictCheckpoint: boolean; semanticRecall: false };
  limits: { maxRecallResults: number; maxSaveCharacters: number; maxEvidenceCharacters: number; maxEvidenceMessages: number };
}> {
  const access = await requireHermesMemoryAccess(ctx, ctx.actor.kind === 'api_key' && ctx.actor.scopes.includes('memory.read') ? 'memory.read' : 'memory.write');
  const scopes = ctx.actor.kind === 'api_key' ? ctx.actor.scopes : [];
  return {
    apiVersion: 'v1',
    provider: 'next-wiki',
    namespace: { id: access.namespaceId, displayName: access.namespaceName, state: 'active' },
    capabilities: {
      recall: scopes.includes('memory.read'),
      save: scopes.includes('memory.write'),
      forget: scopes.includes('memory.delete'),
      asynchronousEvidenceCapture: scopes.includes('memory.write'),
      strictCheckpoint: scopes.includes('memory.write'),
      semanticRecall: false,
    },
    limits: { maxRecallResults: 10, maxSaveCharacters: 16_000, maxEvidenceCharacters: 64_000, maxEvidenceMessages: 100 },
  };
}

export async function getDiagnostics(ctx: PermCtx): Promise<{
  status: 'healthy';
  apiVersion: 'v1';
  namespaceState: 'active';
  grantedScopes: ApiKeyScope[];
}> {
  await getConnection(ctx);
  return {
    status: 'healthy',
    apiVersion: 'v1',
    namespaceState: 'active',
    grantedScopes: ctx.actor.kind === 'api_key' ? ctx.actor.scopes.filter((scope) => scope.startsWith('memory.')) : [],
  };
}

export async function save(ctx: PermCtx, input: HermesMemorySaveInput): Promise<{ record: HermesMemoryRecord; idempotent: boolean }> {
  const access = await requireHermesMemoryAccess(ctx, 'memory.write');
  const title = input.title ?? 'Hermes memory';
  const content = input.tags?.length
    ? mergeSupportedMetadata(input.content, { title, tags: input.tags }, title).source
    : input.content;
  return createRecord(ctx, access, {
    type: 'memory',
    idempotencyKey: input.idempotencyKey,
    title,
    content,
    evidenceIds: input.evidenceIds,
    relation: 'explicit_save',
  });
}

export async function recall(ctx: PermCtx, query: string, limit: number): Promise<HermesMemoryRecord[]> {
  const access = await requireHermesMemoryAccess(ctx, 'memory.read');
  const candidates = await db.query.hermesMemoryRecords.findMany({
    where: and(
      eq(schema.hermesMemoryRecords.namespaceId, access.namespaceId),
      eq(schema.hermesMemoryRecords.recordType, 'memory'),
      eq(schema.hermesMemoryRecords.state, 'active'),
    ),
    orderBy: (records, { desc }) => [desc(records.updatedAt)],
    limit: Math.max(limit * 4, limit),
  });
  const scored = await Promise.all(candidates.map(async (record) => {
    const view = await recordToView(record);
    return view ? { view, score: lexicalScore(query, view.excerpt, view.title) } : null;
  }));
  return scored
    .filter((result): result is { view: HermesMemoryRecord; score: number } => result !== null && result.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, limit)
    .map(({ view }) => view);
}

export async function forget(ctx: PermCtx, memoryId: string): Promise<{ memoryId: string; state: 'forgotten'; forgottenAt: string }> {
  const access = await requireHermesMemoryAccess(ctx, 'memory.delete');
  const record = await db.query.hermesMemoryRecords.findFirst({
    where: and(
      eq(schema.hermesMemoryRecords.id, memoryId),
      eq(schema.hermesMemoryRecords.namespaceId, access.namespaceId),
      eq(schema.hermesMemoryRecords.recordType, 'memory'),
    ),
  });
  if (!record) throw new DomainError('HERMES_MEMORY_RECORD_NOT_FOUND', 'Memory record not found');
  if (record.state === 'forgotten') {
    return { memoryId: record.id, state: 'forgotten', forgottenAt: record.forgottenAt?.toISOString() ?? record.updatedAt.toISOString() };
  }
  const page = await db.query.pages.findFirst({ where: eq(schema.pages.id, record.pageId), columns: { path: true } });
  if (!page) throw new DomainError('HERMES_MEMORY_RECORD_NOT_FOUND', 'Memory record not found');
  await pageService.remove(memoryPageContext(ctx), page.path);
  const now = new Date();
  await db.update(schema.hermesMemoryRecords).set({ state: 'forgotten', forgottenAt: now, updatedAt: now }).where(eq(schema.hermesMemoryRecords.id, record.id));
  return { memoryId: record.id, state: 'forgotten', forgottenAt: now.toISOString() };
}

export async function createEvidenceRecord(
  ctx: PermCtx,
  input: HermesMemoryEvidenceInput,
): Promise<{ record: HermesMemoryRecord; idempotent: boolean }> {
  const access = await requireHermesMemoryAccess(ctx, 'memory.write');
  const content = input.messages.map((message) => `## ${message.role}\n\n${message.content}`).join('\n\n');
  return createRecord(ctx, access, {
    type: 'evidence',
    idempotencyKey: input.idempotencyKey,
    title: input.checkpoint ? 'Hermes checkpoint evidence' : 'Hermes conversation evidence',
    content,
    sourceSessionDigest: input.sessionDigest,
  });
}

export type HermesMemoryCaptureSubmission = {
  captureId: string;
  status: 'queued' | 'running' | 'durable' | 'failed' | 'cancelled';
  durable: boolean;
  idempotent: boolean;
};

export async function submitEvidenceCapture(
  ctx: PermCtx,
  input: HermesMemoryEvidenceInput,
): Promise<HermesMemoryCaptureSubmission> {
  const access = await requireHermesMemoryAccess(ctx, 'memory.write');
  const existing = await db.query.hermesMemoryCaptures.findFirst({
    where: and(
      eq(schema.hermesMemoryCaptures.namespaceId, access.namespaceId),
      eq(schema.hermesMemoryCaptures.idempotencyKey, input.idempotencyKey),
    ),
  });
  if (existing) {
    return { captureId: existing.id, status: existing.status, durable: existing.status === 'durable', idempotent: true };
  }

  const captureId = randomUUID();
  try {
    await db.insert(schema.hermesMemoryCaptures).values({
      id: captureId,
      namespaceId: access.namespaceId,
      apiKeyId: access.keyId,
      idempotencyKey: input.idempotencyKey,
      sessionDigest: input.sessionDigest,
      checkpoint: input.checkpoint,
    });
  } catch (error) {
    const winner = await db.query.hermesMemoryCaptures.findFirst({
      where: and(
        eq(schema.hermesMemoryCaptures.namespaceId, access.namespaceId),
        eq(schema.hermesMemoryCaptures.idempotencyKey, input.idempotencyKey),
      ),
    });
    if (winner) return { captureId: winner.id, status: winner.status, durable: winner.status === 'durable', idempotent: true };
    throw error;
  }

  const jobId = await enqueue(QUEUES.hermesMemoryCapture, {
    captureId,
    messages: input.messages,
  }, { singletonKey: captureId, singletonSeconds: 60 });
  if (!jobId) {
    await db.update(schema.hermesMemoryCaptures)
      .set({ status: 'failed', failureCode: 'JOB_QUEUE_UNAVAILABLE', updatedAt: new Date() })
      .where(eq(schema.hermesMemoryCaptures.id, captureId));
    return { captureId, status: 'failed', durable: false, idempotent: false };
  }
  await db.update(schema.hermesMemoryCaptures)
    .set({ jobId, updatedAt: new Date() })
    .where(eq(schema.hermesMemoryCaptures.id, captureId));
  return { captureId, status: 'queued', durable: false, idempotent: false };
}

export async function getEvidenceCapture(ctx: PermCtx, captureId: string): Promise<{
  captureId: string;
  status: 'queued' | 'running' | 'durable' | 'failed' | 'cancelled';
  durable: boolean;
  evidence?: { evidenceId: string; citation: HermesMemoryRecord['citation'] };
  failureCode?: string;
}> {
  const access = await requireHermesMemoryAccess(ctx, 'memory.write');
  const capture = await db.query.hermesMemoryCaptures.findFirst({
    where: and(eq(schema.hermesMemoryCaptures.id, captureId), eq(schema.hermesMemoryCaptures.namespaceId, access.namespaceId)),
  });
  if (!capture) throw new DomainError('HERMES_MEMORY_RECORD_NOT_FOUND', 'Evidence capture not found');
  if (capture.status !== 'durable' || !capture.evidenceRecordId) {
    return {
      captureId: capture.id,
      status: capture.status,
      durable: false,
      ...(capture.failureCode ? { failureCode: capture.failureCode } : {}),
    };
  }
  const record = await db.query.hermesMemoryRecords.findFirst({ where: eq(schema.hermesMemoryRecords.id, capture.evidenceRecordId) });
  const view = record ? await recordToView(record) : null;
  if (!view) {
    throw new DomainError('HERMES_MEMORY_CHECKPOINT_NOT_DURABLE', 'Evidence capture is no longer durable');
  }
  return { captureId: capture.id, status: 'durable', durable: true, evidence: { evidenceId: view.memoryId, citation: view.citation } };
}

export async function runEvidenceCapture(
  data: { captureId: string; messages: HermesMemoryEvidenceInput['messages'] },
): Promise<void> {
  const capture = await db.query.hermesMemoryCaptures.findFirst({ where: eq(schema.hermesMemoryCaptures.id, data.captureId) });
  if (!capture || capture.status === 'durable' || capture.status === 'cancelled') return;
  await db.update(schema.hermesMemoryCaptures).set({ status: 'running', updatedAt: new Date() }).where(eq(schema.hermesMemoryCaptures.id, capture.id));

  try {
    const key = await db.query.apiKeys.findFirst({
      where: and(eq(schema.apiKeys.id, capture.apiKeyId), isNull(schema.apiKeys.revokedAt)),
      with: { user: true },
    });
    if (!key || key.user.status === 'disabled') {
      throw new DomainError('UNAUTHORIZED', 'The Hermes memory key is no longer active');
    }
    const workerCtx: PermCtx = {
      actor: {
        kind: 'api_key',
        keyId: key.id,
        userId: key.userId,
        role: key.user.role,
        scopes: key.scopes,
        spaceAccess: key.spaceAccess,
      },
    };
    const result = await createEvidenceRecord(workerCtx, {
      idempotencyKey: capture.idempotencyKey,
      sessionDigest: capture.sessionDigest,
      checkpoint: capture.checkpoint,
      messages: data.messages,
    });
    await db.update(schema.hermesMemoryCaptures)
      .set({ status: 'durable', evidenceRecordId: result.record.memoryId, failureCode: null, updatedAt: new Date() })
      .where(eq(schema.hermesMemoryCaptures.id, capture.id));
  } catch (error) {
    const failureCode = error instanceof DomainError ? error.code : 'HERMES_MEMORY_CAPTURE_FAILED';
    await db.update(schema.hermesMemoryCaptures)
      .set({ status: 'failed', failureCode, updatedAt: new Date() })
      .where(eq(schema.hermesMemoryCaptures.id, capture.id));
  }
}
