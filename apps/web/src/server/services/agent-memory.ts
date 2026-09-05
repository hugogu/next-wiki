import { createHash, randomUUID } from 'node:crypto';
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { readMarkdownWithFallback } from '@/server/content-store/read-router';
import { DomainError } from '@/server/errors';
import type { PermCtx } from '@/server/permissions';
import { requireAgentMemoryAccess, type AgentMemoryAccess } from '@/server/permissions/agent-memory';
import * as rawEntries from '@/server/services/raw-entries';
import { ensureSystemCategory } from '@/server/services/raw-categories';
import { canonicalSpacePath } from '@/server/services/space-routes';
import { resolveSpace } from '@/server/services/spaces';
import { isLlmWikiMode } from '@/server/services/writing-mode';
import { env } from '@/server/config';
import { enqueue, QUEUES } from '@/server/jobs/runtime';
import { agentMemoryEvidenceInputSchema } from '@next-wiki/shared';
import type { ApiKeyScope, AgentMemoryEvidenceInput, AgentMemoryRecord, AgentMemorySaveInput } from '@next-wiki/shared';
import { agentMemoryPathSegment } from '@/server/services/agent-memory-path';

const MEMORY_PAGE_PREFIX = 'agent-memory';
const AGENT_MEMORY_CATEGORY_SYSTEM_KEY = 'agent-memory';
const MAX_EXCERPT_LENGTH = 1_200;

type MemoryRecordRow = typeof schema.agentMemoryRecords.$inferSelect;
type EvidenceRelation = 'explicit_save' | 'automatic_capture' | 'checkpoint';

function memoryRawContext(ctx: PermCtx): PermCtx {
  if (ctx.actor.kind !== 'api_key') {
    throw new DomainError('UNAUTHORIZED', 'A dedicated Agent memory API key is required');
  }
  // The dedicated key never exposes generic page scopes. This internal adapter
  // adds only the append-only Raw create capability after destination checks.
  const scopes = Array.from(new Set<ApiKeyScope>([
    ...ctx.actor.scopes,
    'view',
    'create',
  ]));
  return { actor: { ...ctx.actor, scopes } };
}

function memoryPath(
  namespaceId: string,
  agentIdentity: string,
  keyName: string,
  type: 'memory' | 'evidence',
  idempotencyKey: string,
): string {
  // Keep the tree useful to humans while retaining namespace isolation in the
  // deterministic leaf digest. Agent identities are user-configured strings,
  // so normalize them to the lowercase path grammar instead of exposing a
  // UUID namespace folder or allowing path separators into the Raw tree.
  const folder = agentMemoryPathSegment(agentIdentity) || agentMemoryPathSegment(keyName) || 'agent';
  const keyDigest = createHash('sha256').update(`${namespaceId}:${agentIdentity}:${type}:${idempotencyKey}`).digest('hex');
  return `${MEMORY_PAGE_PREFIX}/${folder}/${type}/${keyDigest}`;
}

/**
 * A conversation is an aggregate of capture events, not an individual event.
 * The path is derived only from server-resolved destination/identity and the
 * one-way session correlation value; clients never select a Raw page path.
 */
function conversationPath(namespaceId: string, agentIdentity: string, sessionDigest: string): string {
  const folder = agentMemoryPathSegment(agentIdentity) || 'agent';
  const conversationDigest = createHash('sha256')
    .update(`${namespaceId}:${agentIdentity}:conversation:${sessionDigest}`)
    .digest('hex');
  return `${MEMORY_PAGE_PREFIX}/${folder}/conversation/${conversationDigest}`;
}

function evidencePayloadDigest(input: Pick<AgentMemoryEvidenceInput, 'sessionDigest' | 'checkpoint' | 'messages'>): string {
  return createHash('sha256').update(JSON.stringify({
    sessionDigest: input.sessionDigest,
    checkpoint: input.checkpoint,
    messages: input.messages,
  })).digest('hex');
}

async function ensureAgentMemoryCategory(): Promise<string> {
  const category = await ensureSystemCategory(AGENT_MEMORY_CATEGORY_SYSTEM_KEY, {
    name: 'Agent Memory',
    slug: 'agent-memory',
    description: 'Immutable memory records captured by an external agent.',
  });
  return category.id;
}

async function assertRawMemoryReady(): Promise<void> {
  const rawSpace = await resolveSpace('raw');
  if (!rawSpace || rawSpace.kind !== 'raw' || !(await isLlmWikiMode())) {
    throw new DomainError(
      'AGENT_MEMORY_NAMESPACE_UNAVAILABLE',
      'The shared Raw space is unavailable. Enable LLM Wiki writing mode before connecting Agent memory.',
    );
  }
}

function excerpt(content: string): string {
  return content.replace(/^---[\s\S]*?---\s*/u, '').replace(/\s+/gu, ' ').trim().slice(0, MAX_EXCERPT_LENGTH);
}

function evidenceTitle(checkpoint: boolean, messages: AgentMemoryEvidenceInput['messages'], createdAt = new Date()): string {
  const prefix = checkpoint ? 'Agent checkpoint' : 'Agent conversation';
  const firstMessage = messages.find((message) => message.role === 'user') ?? messages[0];
  const topic = firstMessage?.content
    .replace(/[\u0000-\u001f\u007f]/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
  const timestamp = createdAt.toISOString().slice(0, 19).replace('T', ' ');
  return `${prefix} · ${timestamp} UTC${topic ? ` · ${topic}` : ''}`.slice(0, 160);
}

function lexicalScore(query: string, content: string, title: string): number {
  const terms = query.toLocaleLowerCase().split(/[^\p{L}\p{N}_-]+/u).filter((term) => term.length > 1);
  if (terms.length === 0) return 0;
  const haystack = `${title}\n${content}`.toLocaleLowerCase();
  return terms.reduce((score, term) => score + (haystack.includes(term) ? 1 : 0), 0) / terms.length;
}

async function recordToView(record: MemoryRecordRow, revisionId = record.currentRevisionId): Promise<AgentMemoryRecord | null> {
  if (record.state !== 'active') return null;
  const [page, revision, space] = await Promise.all([
    db.query.pages.findFirst({ where: and(eq(schema.pages.id, record.pageId), isNull(schema.pages.deletedAt)) }),
    db.query.pageRevisions.findFirst({ where: eq(schema.pageRevisions.id, revisionId) }),
    resolveSpace('raw'),
  ]);
  if (!page || !revision || revision.status !== 'published' || !space || space.kind !== 'raw' || page.spaceId !== space.id || page.visibility !== 'restricted') return null;
  const source = await readMarkdownWithFallback(revision);
  const evidenceLinks = record.recordType === 'memory'
    ? await db.query.agentMemoryEvidenceLinks.findMany({
        where: eq(schema.agentMemoryEvidenceLinks.memoryRecordId, record.id),
        with: { evidence: true },
      })
    : [];
  const evidence = [] as AgentMemoryRecord['evidence'];
  for (const link of evidenceLinks) {
    const evidenceRecord = link.evidence;
    if (evidenceRecord.namespaceId !== record.namespaceId || evidenceRecord.agentIdentity !== record.agentIdentity || evidenceRecord.state !== 'active') continue;
    const [evidencePage, evidenceRevision] = await Promise.all([
      db.query.pages.findFirst({ where: and(eq(schema.pages.id, evidenceRecord.pageId), isNull(schema.pages.deletedAt)) }),
      db.query.pageRevisions.findFirst({ where: eq(schema.pageRevisions.id, evidenceRecord.currentRevisionId) }),
    ]);
    if (!evidencePage || !evidenceRevision || evidenceRevision.status !== 'published' || evidencePage.spaceId !== space.id || evidencePage.visibility !== 'restricted') continue;
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

async function existingByIdempotency(namespaceId: string, agentIdentity: string, idempotencyKey: string): Promise<MemoryRecordRow | null> {
  return (await db.query.agentMemoryRecords.findFirst({
    where: and(
      eq(schema.agentMemoryRecords.namespaceId, namespaceId),
      eq(schema.agentMemoryRecords.agentIdentity, agentIdentity),
      eq(schema.agentMemoryRecords.idempotencyKey, idempotencyKey),
    ),
  })) ?? null;
}

async function assertMatchingIdempotentRecord(
  existing: MemoryRecordRow,
  input: { type: 'memory' | 'evidence'; title: string; content: string },
  revisionId = existing.currentRevisionId,
): Promise<void> {
  const [page, revision] = await Promise.all([
    db.query.pages.findFirst({ where: eq(schema.pages.id, existing.pageId) }),
    db.query.pageRevisions.findFirst({ where: eq(schema.pageRevisions.id, revisionId) }),
  ]);
  // Evidence titles are server-generated presentation metadata. A retry can
  // legitimately arrive at a different second, so content/type remain the
  // idempotency contract while the original winner's title is preserved.
  if (!page || !revision || existing.recordType !== input.type || (input.type === 'memory' && page.title !== input.title)) {
    throw new DomainError('CONFLICT', 'The idempotency key is already associated with different memory content');
  }
  const source = await readMarkdownWithFallback(revision);
  if (source !== input.content) {
    throw new DomainError('CONFLICT', 'The idempotency key is already associated with different memory content');
  }
}

async function assertEvidenceIds(namespaceId: string, agentIdentity: string, evidenceIds: string[] | undefined): Promise<void> {
  if (!evidenceIds?.length) return;
  const records = await db.query.agentMemoryRecords.findMany({
    where: and(
      eq(schema.agentMemoryRecords.namespaceId, namespaceId),
      eq(schema.agentMemoryRecords.agentIdentity, agentIdentity),
      inArray(schema.agentMemoryRecords.id, evidenceIds),
      eq(schema.agentMemoryRecords.recordType, 'evidence'),
      eq(schema.agentMemoryRecords.state, 'active'),
    ),
    columns: { id: true },
  });
  if (records.length !== new Set(evidenceIds).size) {
    throw new DomainError('AGENT_MEMORY_RECORD_NOT_FOUND', 'One or more evidence records are unavailable');
  }
}

async function findRawPageByPath(path: string): Promise<typeof schema.pages.$inferSelect | null> {
  const space = await resolveSpace('raw');
  if (!space || space.kind !== 'raw') return null;
  return (await db.query.pages.findFirst({
    where: and(
      eq(schema.pages.spaceId, space.id),
      eq(schema.pages.path, path),
      isNull(schema.pages.translationGroupId),
      isNull(schema.pages.deletedAt),
    ),
  })) ?? null;
}

async function findCaptureRevision(pageId: string, captureId: string): Promise<typeof schema.pageRevisions.$inferSelect | null> {
  return (await db.query.pageRevisions.findFirst({
    where: and(
      eq(schema.pageRevisions.pageId, pageId),
      sql`${schema.pageRevisions.sourceMetadata}->>'sourceId' = ${captureId}`,
    ),
  })) ?? null;
}

async function findRecordByPage(pageId: string): Promise<MemoryRecordRow | null> {
  return (await db.query.agentMemoryRecords.findFirst({ where: eq(schema.agentMemoryRecords.pageId, pageId) })) ?? null;
}

/** Advance the aggregate projection without allowing concurrent workers to move it backwards. */
async function advanceEvidenceRecord(recordId: string, revisionId: string): Promise<MemoryRecordRow | null> {
  await db.transaction(async (tx) => {
    const [record] = await tx.select().from(schema.agentMemoryRecords)
      .where(eq(schema.agentMemoryRecords.id, recordId))
      .for('update')
      .limit(1);
    if (!record || record.recordType !== 'evidence') return;
    const [currentRevision, nextRevision] = await Promise.all([
      tx.query.pageRevisions.findFirst({ where: eq(schema.pageRevisions.id, record.currentRevisionId) }),
      tx.query.pageRevisions.findFirst({ where: eq(schema.pageRevisions.id, revisionId) }),
    ]);
    if (!currentRevision || !nextRevision || nextRevision.versionNumber <= currentRevision.versionNumber) return;
    await tx.update(schema.agentMemoryRecords)
      .set({ currentRevisionId: nextRevision.id, updatedAt: new Date() })
      .where(eq(schema.agentMemoryRecords.id, record.id));
  });
  return (await db.query.agentMemoryRecords.findFirst({ where: eq(schema.agentMemoryRecords.id, recordId) })) ?? null;
}

async function createRecord(
  ctx: PermCtx,
  access: AgentMemoryAccess,
  input: {
    type: 'memory' | 'evidence';
    idempotencyKey: string;
    title: string;
    content: string;
    tags?: string[];
    sourceSessionDigest?: string;
    evidenceIds?: string[];
    relation?: EvidenceRelation;
  },
): Promise<{ record: AgentMemoryRecord; idempotent: boolean }> {
  const existing = await existingByIdempotency(access.namespaceId, access.agentIdentity, input.idempotencyKey);
  if (existing) {
    await assertMatchingIdempotentRecord(existing, input);
    const view = await recordToView(existing);
    if (!view) throw new DomainError('AGENT_MEMORY_RECORD_NOT_FOUND', 'The existing memory record is unavailable');
    return { record: view, idempotent: true };
  }
  await assertEvidenceIds(access.namespaceId, access.agentIdentity, input.evidenceIds);
  await assertRawMemoryReady();

  const recordId = randomUUID();
  try {
    const categoryId = await ensureAgentMemoryCategory();
    const page = await rawEntries.createEntry(memoryRawContext(ctx), {
      path: memoryPath(access.namespaceId, access.agentIdentity, access.keyName, input.type, input.idempotencyKey),
      title: input.title,
      inputKind: input.type === 'evidence' ? 'chat-transcript' : 'manual-note',
      source: {
        provider: 'agent-memory',
        ...(input.sourceSessionDigest ? { sessionId: input.sourceSessionDigest } : {}),
      },
      additionalSourceMetadata: {
        agentIdentity: access.agentIdentity,
        apiKeyName: access.keyName,
        ...(input.tags?.length ? { tags: input.tags } : {}),
      },
      content: input.content,
      visibility: 'restricted',
      categoryId,
    });
    const [record] = await db
      .insert(schema.agentMemoryRecords)
      .values({
        id: recordId,
        namespaceId: access.namespaceId,
        agentIdentity: access.agentIdentity,
        recordType: input.type,
        pageId: page.pageId,
        currentRevisionId: page.versionId,
        idempotencyKey: input.idempotencyKey,
        sourceSessionDigest: input.sourceSessionDigest ?? null,
      })
      .returning();
    if (!record) throw new Error('AGENT_MEMORY_RECORD_INSERT_FAILED');
    if (input.type === 'memory' && input.evidenceIds?.length) {
      await db.insert(schema.agentMemoryEvidenceLinks).values(
        input.evidenceIds.map((evidenceRecordId) => ({
          memoryRecordId: record.id,
          evidenceRecordId,
          relation: input.relation ?? 'explicit_save',
        })),
      );
    }
    const view = await recordToView(record);
    if (!view) throw new Error('AGENT_MEMORY_RECORD_NOT_VISIBLE');
    return { record: view, idempotent: false };
  } catch (error) {
    // A simultaneous retry may win the destination/idempotency unique index.
    // The Raw path is deterministic for the idempotency key, so a retry cannot
    // create a second indexed source entry. The winner remains the only Agent Memory
    // projection for this key.
    const winner = await existingByIdempotency(access.namespaceId, access.agentIdentity, input.idempotencyKey);
    if (winner) {
      await assertMatchingIdempotentRecord(winner, input);
      const view = await recordToView(winner);
      if (view) return { record: view, idempotent: true };
    }
    throw error;
  }
}

export async function getConnection(ctx: PermCtx, options: { allowAnyMemoryScope?: boolean } = {}): Promise<{
  apiVersion: 'v1';
  provider: 'next-wiki';
  namespace: { id: string; displayName: string; state: 'active'; agentIdentity: string };
  capabilities: { recall: boolean; save: boolean; forget: boolean; asynchronousEvidenceCapture: boolean; strictCheckpoint: boolean; semanticRecall: false };
  limits: { maxRecallResults: number; maxSaveCharacters: number; maxEvidenceCharacters: number; maxEvidenceMessages: number };
}> {
  const requiredScope = options.allowAnyMemoryScope
    ? 'any' as const
    : (ctx.actor.kind === 'api_key' && ctx.actor.scopes.includes('memory.read') ? 'memory.read' : 'memory.write');
  const access = await requireAgentMemoryAccess(ctx, requiredScope);
  await assertRawMemoryReady();
  const scopes = ctx.actor.kind === 'api_key' ? ctx.actor.scopes : [];
  return {
    apiVersion: 'v1',
    provider: 'next-wiki',
    namespace: { id: access.namespaceId, displayName: access.namespaceName, state: 'active', agentIdentity: access.agentIdentity },
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
  await getConnection(ctx, { allowAnyMemoryScope: true });
  return {
    status: 'healthy',
    apiVersion: 'v1',
    namespaceState: 'active',
    grantedScopes: ctx.actor.kind === 'api_key' ? ctx.actor.scopes.filter((scope) => scope.startsWith('memory.')) : [],
  };
}

export async function save(ctx: PermCtx, input: AgentMemorySaveInput): Promise<{ record: AgentMemoryRecord; idempotent: boolean }> {
  const access = await requireAgentMemoryAccess(ctx, 'memory.write');
  const title = input.title ?? 'Agent memory';
  return createRecord(ctx, access, {
    type: 'memory',
    idempotencyKey: input.idempotencyKey,
    title,
    content: input.content,
    tags: input.tags,
    evidenceIds: input.evidenceIds,
    relation: 'explicit_save',
  });
}

export async function recall(ctx: PermCtx, query: string, limit: number): Promise<AgentMemoryRecord[]> {
  const access = await requireAgentMemoryAccess(ctx, 'memory.read');
  const candidates = await db.query.agentMemoryRecords.findMany({
    where: and(
      eq(schema.agentMemoryRecords.namespaceId, access.namespaceId),
      eq(schema.agentMemoryRecords.agentIdentity, access.agentIdentity),
      // Durable automatic captures are first-class searchable evidence. They
      // share the same namespace/identity boundary and Raw-backed revision
      // checks as explicit memories, so filtering them out here makes the
      // capture feature appear to succeed while recall can never observe it.
      inArray(schema.agentMemoryRecords.recordType, ['memory', 'evidence']),
      eq(schema.agentMemoryRecords.state, 'active'),
    ),
    orderBy: (records, { desc }) => [desc(records.updatedAt)],
    limit: Math.max(limit * 4, limit),
  });
  const scored = await Promise.all(candidates.map(async (record) => {
    const view = await recordToView(record);
    return view ? { view, score: lexicalScore(query, view.excerpt, view.title) } : null;
  }));
  return scored
    .filter((result): result is { view: AgentMemoryRecord; score: number } => result !== null && result.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, limit)
    .map(({ view }) => view);
}

export async function forget(ctx: PermCtx, memoryId: string): Promise<{ memoryId: string; state: 'forgotten'; forgottenAt: string }> {
  const access = await requireAgentMemoryAccess(ctx, 'memory.delete');
  const record = await db.query.agentMemoryRecords.findFirst({
    where: and(
      eq(schema.agentMemoryRecords.id, memoryId),
      eq(schema.agentMemoryRecords.namespaceId, access.namespaceId),
      eq(schema.agentMemoryRecords.agentIdentity, access.agentIdentity),
      eq(schema.agentMemoryRecords.recordType, 'memory'),
    ),
  });
  if (!record) throw new DomainError('AGENT_MEMORY_RECORD_NOT_FOUND', 'Memory record not found');
  if (record.state === 'forgotten') {
    return { memoryId: record.id, state: 'forgotten', forgottenAt: record.forgottenAt?.toISOString() ?? record.updatedAt.toISOString() };
  }
  const now = new Date();
  await db.update(schema.agentMemoryRecords).set({ state: 'forgotten', forgottenAt: now, updatedAt: now }).where(eq(schema.agentMemoryRecords.id, record.id));
  return { memoryId: record.id, state: 'forgotten', forgottenAt: now.toISOString() };
}

export async function createEvidenceRecord(
  ctx: PermCtx,
  input: AgentMemoryEvidenceInput,
  options: { captureId?: string } = {},
): Promise<{ record: AgentMemoryRecord; idempotent: boolean; revisionId: string }> {
  const access = await requireAgentMemoryAccess(ctx, 'memory.write');
  const content = input.messages.map((message) => `## ${message.role}\n\n${message.content}`).join('\n\n');
  const title = evidenceTitle(input.checkpoint, input.messages);
  const existing = await existingByIdempotency(access.namespaceId, access.agentIdentity, input.idempotencyKey);
  if (existing) {
    const revision = options.captureId ? await findCaptureRevision(existing.pageId, options.captureId) : null;
    await assertMatchingIdempotentRecord(existing, { type: 'evidence', title, content }, revision?.id);
    const view = await recordToView(existing);
    if (!view) throw new DomainError('AGENT_MEMORY_RECORD_NOT_FOUND', 'The existing evidence record is unavailable');
    return { record: view, idempotent: true, revisionId: revision?.id ?? existing.currentRevisionId };
  }

  await assertRawMemoryReady();
  const categoryId = await ensureAgentMemoryCategory();
  const path = conversationPath(access.namespaceId, access.agentIdentity, input.sessionDigest);
  const source = {
    provider: 'agent-memory',
    sessionId: input.sessionDigest,
    ...(options.captureId ? { sourceId: options.captureId } : {}),
  };

  let page = await findRawPageByPath(path);
  let revisionId: string;
  if (page) {
    const existingRevision = options.captureId ? await findCaptureRevision(page.id, options.captureId) : null;
    if (existingRevision) {
      revisionId = existingRevision.id;
    } else {
      const appended = await rawEntries.appendEntry(memoryRawContext(ctx), page.id, { content, source });
      revisionId = appended.versionId;
    }
  } else {
    try {
      const created = await rawEntries.createEntry(memoryRawContext(ctx), {
        path,
        title,
        inputKind: 'chat-transcript',
        source,
        additionalSourceMetadata: {
          agentIdentity: access.agentIdentity,
          apiKeyName: access.keyName,
        },
        content,
        visibility: 'restricted',
        categoryId,
      });
      revisionId = created.versionId;
      page = await findRawPageByPath(path);
    } catch (error) {
      // Another capture for this same session may have won page creation. Use
      // that page and append this event instead of creating a second page.
      page = await findRawPageByPath(path);
      if (!page) throw error;
      const existingRevision = options.captureId ? await findCaptureRevision(page.id, options.captureId) : null;
      if (existingRevision) {
        revisionId = existingRevision.id;
      } else {
        const appended = await rawEntries.appendEntry(memoryRawContext(ctx), page.id, { content, source });
        revisionId = appended.versionId;
      }
    }
  }
  if (!page) throw new Error('AGENT_MEMORY_CONVERSATION_PAGE_NOT_FOUND');

  let record = await findRecordByPage(page.id);
  if (!record) {
    try {
      const [inserted] = await db.insert(schema.agentMemoryRecords).values({
        id: randomUUID(),
        namespaceId: access.namespaceId,
        agentIdentity: access.agentIdentity,
        recordType: 'evidence',
        pageId: page.id,
        currentRevisionId: revisionId,
        idempotencyKey: input.idempotencyKey,
        sourceSessionDigest: input.sessionDigest,
      }).returning();
      record = inserted ?? null;
    } catch (error) {
      record = await findRecordByPage(page.id);
      if (!record) throw error;
    }
  }
  if (!record || record.recordType !== 'evidence' || record.namespaceId !== access.namespaceId || record.agentIdentity !== access.agentIdentity || record.sourceSessionDigest !== input.sessionDigest) {
    throw new DomainError('CONFLICT', 'The conversation path is already associated with a different evidence record');
  }
  record = await advanceEvidenceRecord(record.id, revisionId);
  if (!record) throw new Error('AGENT_MEMORY_RECORD_NOT_FOUND');
  const view = await recordToView(record);
  if (!view) throw new Error('AGENT_MEMORY_RECORD_NOT_VISIBLE');
  return { record: view, idempotent: false, revisionId };
}

export type AgentMemoryCaptureSubmission = {
  captureId: string;
  status: 'queued' | 'running' | 'durable' | 'failed' | 'cancelled';
  durable: boolean;
  idempotent: boolean;
};

export async function submitEvidenceCapture(
  ctx: PermCtx,
  input: AgentMemoryEvidenceInput,
): Promise<AgentMemoryCaptureSubmission> {
  const parsedInput = agentMemoryEvidenceInputSchema.safeParse(input);
  if (!parsedInput.success) {
    throw new DomainError('AGENT_MEMORY_EVIDENCE_INVALID', 'Evidence capture payload is invalid or exceeds the configured limits');
  }
  const normalizedInput = parsedInput.data;
  const access = await requireAgentMemoryAccess(ctx, 'memory.write');
  const payloadDigest = evidencePayloadDigest(normalizedInput);
  return db.transaction(async (tx) => {
    let [capture] = await tx
      .select()
      .from(schema.agentMemoryCaptures)
      .where(and(
      eq(schema.agentMemoryCaptures.namespaceId, access.namespaceId),
        eq(schema.agentMemoryCaptures.agentIdentity, access.agentIdentity),
        eq(schema.agentMemoryCaptures.idempotencyKey, normalizedInput.idempotencyKey),
      ))
      .for('update')
      .limit(1);
    let idempotent = Boolean(capture);

    if (capture && capture.payloadDigest !== 'legacy' && (
      capture.payloadDigest !== payloadDigest
      || capture.sessionDigest !== normalizedInput.sessionDigest
      || capture.checkpoint !== normalizedInput.checkpoint
    )) {
      throw new DomainError('CONFLICT', 'The idempotency key is already associated with different evidence');
    }

    if (!capture) {
      const captureId = randomUUID();
      [capture] = await tx
        .insert(schema.agentMemoryCaptures)
        .values({
          id: captureId,
          namespaceId: access.namespaceId,
          apiKeyId: access.keyId,
          agentIdentity: access.agentIdentity,
          idempotencyKey: normalizedInput.idempotencyKey,
          payloadDigest,
          sessionDigest: normalizedInput.sessionDigest,
          checkpoint: normalizedInput.checkpoint,
        })
        .onConflictDoNothing({ target: [schema.agentMemoryCaptures.namespaceId, schema.agentMemoryCaptures.agentIdentity, schema.agentMemoryCaptures.idempotencyKey] })
        .returning();
      if (!capture) {
        [capture] = await tx
          .select()
          .from(schema.agentMemoryCaptures)
          .where(and(
            eq(schema.agentMemoryCaptures.namespaceId, access.namespaceId),
            eq(schema.agentMemoryCaptures.agentIdentity, access.agentIdentity),
            eq(schema.agentMemoryCaptures.idempotencyKey, normalizedInput.idempotencyKey),
          ))
          .for('update')
          .limit(1);
        if (!capture) throw new Error('AGENT_MEMORY_CAPTURE_RESERVATION_FAILED');
        idempotent = true;
        if (capture.payloadDigest !== 'legacy' && (
          capture.payloadDigest !== payloadDigest
          || capture.sessionDigest !== normalizedInput.sessionDigest
          || capture.checkpoint !== normalizedInput.checkpoint
        )) {
          throw new DomainError('CONFLICT', 'The idempotency key is already associated with different evidence');
        }
      }
    }

    if (capture.payloadDigest === 'legacy') {
      await tx.update(schema.agentMemoryCaptures)
        .set({ payloadDigest, updatedAt: new Date() })
        .where(eq(schema.agentMemoryCaptures.id, capture.id));
      capture = { ...capture, payloadDigest };
    }

    if (capture.status === 'durable' || capture.status === 'running' || (capture.status === 'queued' && capture.jobId)) {
      return { captureId: capture.id, status: capture.status, durable: capture.status === 'durable', idempotent };
    }

    // Failed/cancelled captures, and legacy queued rows without a job id, may
    // be retried with the same idempotency key. The row lock above ensures only
    // one concurrent caller can transition and enqueue the retry.
    await tx.update(schema.agentMemoryCaptures)
      .set({ status: 'queued', jobId: null, failureCode: null, updatedAt: new Date() })
      .where(eq(schema.agentMemoryCaptures.id, capture.id));

    let jobId: string | null = null;
    try {
      jobId = await enqueue(QUEUES.agentMemoryCapture, {
        captureId: capture.id,
        messages: normalizedInput.messages,
      }, {
        singletonKey: capture.id,
        singletonSeconds: 60,
        retryLimit: 5,
        retryDelay: 15,
        retryBackoff: true,
        retryDelayMax: 300,
      });
    } catch {
      jobId = null;
    }
    if (!jobId) {
      await tx.update(schema.agentMemoryCaptures)
        .set({ status: 'failed', failureCode: 'JOB_QUEUE_UNAVAILABLE', updatedAt: new Date() })
        .where(eq(schema.agentMemoryCaptures.id, capture.id));
      return { captureId: capture.id, status: 'failed', durable: false, idempotent };
    }
    await tx.update(schema.agentMemoryCaptures)
      .set({ status: 'queued', jobId, failureCode: null, updatedAt: new Date() })
      .where(eq(schema.agentMemoryCaptures.id, capture.id));
    return { captureId: capture.id, status: 'queued', durable: false, idempotent };
  });
}

export async function getEvidenceCapture(ctx: PermCtx, captureId: string): Promise<{
  captureId: string;
  status: 'queued' | 'running' | 'durable' | 'failed' | 'cancelled';
  durable: boolean;
  evidence?: { evidenceId: string; citation: AgentMemoryRecord['citation'] };
  failureCode?: string;
}> {
  const access = await requireAgentMemoryAccess(ctx, 'memory.write');
  const capture = await db.query.agentMemoryCaptures.findFirst({
    where: and(eq(schema.agentMemoryCaptures.id, captureId), eq(schema.agentMemoryCaptures.namespaceId, access.namespaceId), eq(schema.agentMemoryCaptures.agentIdentity, access.agentIdentity)),
  });
  if (!capture) throw new DomainError('AGENT_MEMORY_RECORD_NOT_FOUND', 'Evidence capture not found');
  if (capture.status !== 'durable' || !capture.evidenceRecordId) {
    return {
      captureId: capture.id,
      status: capture.status,
      durable: false,
      ...(capture.failureCode ? { failureCode: capture.failureCode } : {}),
    };
  }
  const record = await db.query.agentMemoryRecords.findFirst({
    where: and(
      eq(schema.agentMemoryRecords.id, capture.evidenceRecordId),
      eq(schema.agentMemoryRecords.namespaceId, access.namespaceId),
      eq(schema.agentMemoryRecords.agentIdentity, access.agentIdentity),
    ),
  });
  const view = record ? await recordToView(record, capture.evidenceRevisionId ?? record.currentRevisionId) : null;
  if (!view) {
    throw new DomainError('AGENT_MEMORY_CHECKPOINT_NOT_DURABLE', 'Evidence capture is no longer durable');
  }
  return { captureId: capture.id, status: 'durable', durable: true, evidence: { evidenceId: view.memoryId, citation: view.citation } };
}

export async function runEvidenceCapture(
  data: { captureId: string; messages: AgentMemoryEvidenceInput['messages'] },
): Promise<void> {
  const capture = await db.query.agentMemoryCaptures.findFirst({ where: eq(schema.agentMemoryCaptures.id, data.captureId) });
  // submitEvidenceCapture publishes the pg-boss job while its reservation
  // transaction is still committing. A worker can therefore observe the job
  // before the capture row is visible; throw so pg-boss retries instead of
  // acknowledging a job that would otherwise be lost.
  if (!capture) throw new Error('AGENT_MEMORY_CAPTURE_NOT_VISIBLE');
  if (capture.status === 'durable' || capture.status === 'cancelled') return;
  const parsedInput = agentMemoryEvidenceInputSchema.safeParse({
    idempotencyKey: capture.idempotencyKey,
    sessionDigest: capture.sessionDigest,
    checkpoint: capture.checkpoint,
    messages: data.messages,
  });
  if (!parsedInput.success) {
    await db.update(schema.agentMemoryCaptures)
      .set({ status: 'failed', failureCode: 'AGENT_MEMORY_EVIDENCE_INVALID', updatedAt: new Date() })
      .where(and(eq(schema.agentMemoryCaptures.id, capture.id), inArray(schema.agentMemoryCaptures.status, ['queued', 'running', 'failed'])));
    return;
  }
  const payloadDigest = evidencePayloadDigest({
    sessionDigest: capture.sessionDigest,
    checkpoint: capture.checkpoint,
    messages: parsedInput.data.messages,
  });
  if (capture.payloadDigest !== 'legacy' && capture.payloadDigest !== payloadDigest) {
    await db.update(schema.agentMemoryCaptures)
      .set({ status: 'failed', failureCode: 'AGENT_MEMORY_EVIDENCE_INVALID', updatedAt: new Date() })
      .where(and(eq(schema.agentMemoryCaptures.id, capture.id), inArray(schema.agentMemoryCaptures.status, ['queued', 'failed'])));
    return;
  }

  // Claim under a row lock so overlapping deliveries cannot both transition a
  // queued capture before the first worker has observed it. A second delivery
  // may still resume a running row after a process crash; all writes below are
  // idempotent and terminal updates are conditional.
  const claimed = await db.transaction(async (tx) => {
    const [row] = await tx.select().from(schema.agentMemoryCaptures)
      .where(eq(schema.agentMemoryCaptures.id, capture.id))
      .for('update')
      .limit(1);
    if (!row || row.status === 'durable' || row.status === 'cancelled') return null;
    const [updated] = await tx.update(schema.agentMemoryCaptures)
      .set({ status: 'running', payloadDigest: row.payloadDigest === 'legacy' ? payloadDigest : row.payloadDigest, updatedAt: new Date() })
      .where(and(eq(schema.agentMemoryCaptures.id, row.id), inArray(schema.agentMemoryCaptures.status, ['queued', 'running', 'failed'])))
      .returning();
    return updated ?? null;
  });
  if (!claimed) return;

  try {
    const key = await db.query.apiKeys.findFirst({
      where: and(eq(schema.apiKeys.id, capture.apiKeyId), isNull(schema.apiKeys.revokedAt)),
      with: { user: true },
    });
    if (!key || key.user.status === 'disabled') {
      throw new DomainError('UNAUTHORIZED', 'The Agent memory key is no longer active');
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
    const workerAccess = await requireAgentMemoryAccess(workerCtx, 'memory.write');
    if (workerAccess.namespaceId !== capture.namespaceId || workerAccess.agentIdentity !== capture.agentIdentity) {
      throw new DomainError('AGENT_MEMORY_EVIDENCE_INVALID', 'Evidence capture no longer matches its key binding');
    }
    const result = await createEvidenceRecord(workerCtx, {
      idempotencyKey: capture.idempotencyKey,
      sessionDigest: capture.sessionDigest,
      checkpoint: capture.checkpoint,
      messages: parsedInput.data.messages,
    }, { captureId: capture.id });
    await db.update(schema.agentMemoryCaptures)
      .set({ status: 'durable', evidenceRecordId: result.record.memoryId, evidenceRevisionId: result.revisionId, failureCode: null, updatedAt: new Date() })
      .where(and(eq(schema.agentMemoryCaptures.id, capture.id), eq(schema.agentMemoryCaptures.status, 'running')));
  } catch (error) {
    const failureCode = error instanceof DomainError ? error.code : 'AGENT_MEMORY_CAPTURE_FAILED';
    await db.update(schema.agentMemoryCaptures)
      .set({ status: 'failed', failureCode, updatedAt: new Date() })
      .where(and(eq(schema.agentMemoryCaptures.id, capture.id), eq(schema.agentMemoryCaptures.status, 'running')));
    // Permanent authorization/validation failures are represented by the
    // durable failed state. Unexpected storage/queue failures must escape so
    // pg-boss can retry the same idempotent capture automatically.
    if (!(error instanceof DomainError) || ![
      'UNAUTHORIZED',
      'FORBIDDEN',
      'AGENT_MEMORY_SCOPE_REQUIRED',
      'AGENT_MEMORY_KEY_UNBOUND',
      'AGENT_MEMORY_NAMESPACE_UNAVAILABLE',
      'AGENT_MEMORY_RECORD_NOT_FOUND',
      'AGENT_MEMORY_EVIDENCE_INVALID',
    ].includes(error.code)) {
      throw error;
    }
  }
}
