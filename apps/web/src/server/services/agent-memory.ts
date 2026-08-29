import { createHash, randomUUID } from 'node:crypto';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { readMarkdownWithFallback } from '@/server/content-store/read-router';
import { DomainError } from '@/server/errors';
import type { PermCtx } from '@/server/permissions';
import { listActiveGrantedDestinationIds, requireAgentMemoryAccess, type AgentMemoryAccess } from '@/server/permissions/agent-memory';
import * as rawEntries from '@/server/services/raw-entries';
import { ensureSystemCategory } from '@/server/services/raw-categories';
import { canonicalSpacePath } from '@/server/services/space-routes';
import { resolveSpace } from '@/server/services/spaces';
import { isLlmWikiMode } from '@/server/services/writing-mode';
import { env } from '@/server/config';
import type {
  AgentMemoryContentKind,
  AgentMemoryEvidenceInput,
  AgentMemoryOrigin,
  AgentMemoryRecallScope,
  AgentMemoryRecord,
  AgentMemorySaveInput,
  ApiKeyScope,
} from '@next-wiki/shared';

const MEMORY_PAGE_PREFIX = 'agent-memory';
const AGENT_MEMORY_CATEGORY_SYSTEM_KEY = 'agent-memory';
const MAX_EXCERPT_LENGTH = 1_200;

export type MemoryRecordRow = typeof schema.agentMemoryRecords.$inferSelect;
type EvidenceRelation = 'explicit_save' | 'automatic_capture' | 'checkpoint' | 'promotion' | 'import';

function memoryRawContext(ctx: PermCtx): PermCtx {
  if (ctx.actor.kind === 'api_key') {
    // The dedicated key never exposes generic page scopes. This internal
    // adapter adds only the append-only Raw create capability after
    // destination checks.
    const scopes = Array.from(new Set<ApiKeyScope>([
      ...ctx.actor.scopes,
      'view',
      'create',
    ]));
    return { actor: { ...ctx.actor, scopes } };
  }
  if (ctx.actor.kind === 'user' && ctx.actor.role === 'admin') {
    // Owner-triggered curation (promotion) runs in the admin's own session;
    // an admin already has full restricted/raw-space access by role.
    return ctx;
  }
  throw new DomainError('UNAUTHORIZED', 'A dedicated Agent memory API key or an administrator session is required');
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
  const pathSegment = (value: string): string => value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/gu, '-')
    .replace(/^[^a-z0-9]+|[^a-z0-9]+$/gu, '')
    .slice(0, 80);
  const folder = pathSegment(agentIdentity) || pathSegment(keyName) || 'agent';
  const keyDigest = createHash('sha256').update(`${namespaceId}:${agentIdentity}:${type}:${idempotencyKey}`).digest('hex');
  return `${MEMORY_PAGE_PREFIX}/${folder}/${type}/${keyDigest}`;
}

export function evidencePayloadDigest(input: Pick<AgentMemoryEvidenceInput, 'sessionDigest' | 'checkpoint' | 'messages'>): string {
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

export async function recordToView(record: MemoryRecordRow): Promise<AgentMemoryRecord | null> {
  if (record.state !== 'active') return null;
  const [page, revision, space] = await Promise.all([
    db.query.pages.findFirst({ where: and(eq(schema.pages.id, record.pageId), isNull(schema.pages.deletedAt)) }),
    db.query.pageRevisions.findFirst({ where: eq(schema.pageRevisions.id, record.currentRevisionId) }),
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
    origin: record.origin ?? undefined,
    contentKind: record.contentKind,
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
): Promise<void> {
  const [page, revision] = await Promise.all([
    db.query.pages.findFirst({ where: eq(schema.pages.id, existing.pageId) }),
    db.query.pageRevisions.findFirst({ where: eq(schema.pageRevisions.id, existing.currentRevisionId) }),
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

export async function createRecord(
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
    origin: AgentMemoryOrigin;
    contentKind?: AgentMemoryContentKind;
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
        authorConnectionId: access.connectionId,
        recordType: input.type,
        origin: input.origin,
        contentKind: input.contentKind ?? 'original',
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
  connectionId?: string;
  namespace: { id: string; displayName: string; state: 'active'; agentIdentity: string };
  capabilities: { recall: boolean; save: boolean; forget: boolean; asynchronousEvidenceCapture: boolean; strictCheckpoint: boolean; semanticRecall: false; sharedRecall: boolean };
  limits: { maxRecallResults: number; maxSaveCharacters: number; maxEvidenceCharacters: number; maxEvidenceMessages: number };
}> {
  const requiredScope = options.allowAnyMemoryScope
    ? 'any' as const
    : (ctx.actor.kind === 'api_key' && ctx.actor.scopes.includes('memory.read') ? 'memory.read' : 'memory.write');
  const access = await requireAgentMemoryAccess(ctx, requiredScope);
  await assertRawMemoryReady();
  const scopes = ctx.actor.kind === 'api_key' ? ctx.actor.scopes : [];
  const grantedDestinationIds = access.connectionId ? await listActiveGrantedDestinationIds(access.connectionId) : [];
  return {
    apiVersion: 'v1',
    provider: 'next-wiki',
    ...(access.connectionId ? { connectionId: access.connectionId } : {}),
    namespace: { id: access.namespaceId, displayName: access.namespaceName, state: 'active', agentIdentity: access.agentIdentity },
    capabilities: {
      recall: scopes.includes('memory.read'),
      save: scopes.includes('memory.write'),
      forget: scopes.includes('memory.delete'),
      asynchronousEvidenceCapture: scopes.includes('memory.write'),
      strictCheckpoint: scopes.includes('memory.write'),
      semanticRecall: false,
      sharedRecall: grantedDestinationIds.length > 0,
    },
    limits: { maxRecallResults: 10, maxSaveCharacters: 16_000, maxEvidenceCharacters: 64_000, maxEvidenceMessages: 100 },
  };
}

export async function getDiagnostics(ctx: PermCtx): Promise<{
  status: 'healthy';
  apiVersion: 'v1';
  connectionId?: string;
  namespaceState: 'active';
  grantedScopes: ApiKeyScope[];
}> {
  const connection = await getConnection(ctx, { allowAnyMemoryScope: true });
  return {
    status: 'healthy',
    apiVersion: 'v1',
    ...(connection.connectionId ? { connectionId: connection.connectionId } : {}),
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
    origin: 'explicit_save',
  });
}

/**
 * Own-destination candidates plus, when requested and the caller is a
 * connection, active granted-destination candidates. Grant eligibility is
 * re-checked against fresh grant state right before the result is sliced and
 * returned (FR-009) — a grant revoked mid-request drops its records silently
 * rather than surfacing a distinguishable error.
 */
export async function recall(ctx: PermCtx, query: string, limit: number, scope: AgentMemoryRecallScope = 'own'): Promise<AgentMemoryRecord[]> {
  const access = await requireAgentMemoryAccess(ctx, 'memory.read');
  const includeOwn = scope !== 'granted';
  const includeGranted = scope !== 'own' && Boolean(access.connectionId);
  const grantedDestinationIds = includeGranted ? await listActiveGrantedDestinationIds(access.connectionId!) : [];

  const rows: Array<{ record: MemoryRecordRow; own: boolean }> = [];
  if (includeOwn) {
    const ownRecords = await db.query.agentMemoryRecords.findMany({
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
    rows.push(...ownRecords.map((record) => ({ record, own: true })));
  }
  if (grantedDestinationIds.length > 0) {
    // Shared destinations hold only owner-curated `memory` records (never raw
    // evidence or an agent-selected identity filter).
    const grantedRecords = await db.query.agentMemoryRecords.findMany({
      where: and(
        inArray(schema.agentMemoryRecords.namespaceId, grantedDestinationIds),
        eq(schema.agentMemoryRecords.recordType, 'memory'),
        eq(schema.agentMemoryRecords.state, 'active'),
      ),
      orderBy: (records, { desc }) => [desc(records.updatedAt)],
      limit: Math.max(limit * 4, limit),
    });
    rows.push(...grantedRecords.map((record) => ({ record, own: false })));
  }

  const scored = await Promise.all(rows.map(async ({ record, own }) => {
    const view = await recordToView(record);
    if (!view) return null;
    const score = lexicalScore(query, view.excerpt, view.title);
    return score > 0 ? { view, score, own, namespaceId: record.namespaceId } : null;
  }));
  const ranked = scored
    .filter((result): result is { view: AgentMemoryRecord; score: number; own: boolean; namespaceId: string } => result !== null)
    .sort((left, right) => right.score - left.score);

  // Re-evaluate granted eligibility immediately before returning: a grant
  // revoked or expired between candidate selection and now must silently drop
  // its records rather than leak a distinguishable partial result.
  const freshGrantedIds = includeGranted ? new Set(await listActiveGrantedDestinationIds(access.connectionId!)) : new Set<string>();
  const results: AgentMemoryRecord[] = [];
  for (const candidate of ranked) {
    if (!candidate.own && !freshGrantedIds.has(candidate.namespaceId)) continue;
    results.push(candidate.view);
    if (results.length >= limit) break;
  }
  return results;
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
): Promise<{ record: AgentMemoryRecord; idempotent: boolean }> {
  const access = await requireAgentMemoryAccess(ctx, 'memory.write');
  const content = input.messages.map((message) => `## ${message.role}\n\n${message.content}`).join('\n\n');
  return createRecord(ctx, access, {
    type: 'evidence',
    idempotencyKey: input.idempotencyKey,
    title: evidenceTitle(input.checkpoint, input.messages),
    content,
    sourceSessionDigest: input.sessionDigest,
    origin: input.checkpoint ? 'checkpoint' : 'automatic_capture',
  });
}
