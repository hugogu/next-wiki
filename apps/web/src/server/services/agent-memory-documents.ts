import { createHash, randomUUID } from 'node:crypto';
import { and, eq, isNull } from 'drizzle-orm';
import {
  agentMemorySourceDocumentInputSchema,
  type AgentMemorySourceDocumentInput,
} from '@next-wiki/shared';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { DomainError } from '@/server/errors';
import type { PermCtx } from '@/server/permissions';
import { requireAgentMemoryAccess, type AgentMemoryAccess } from '@/server/permissions/agent-memory';
import * as rawEntries from '@/server/services/raw-entries';
import { resolveSpace } from '@/server/services/spaces';
import { canonicalSpacePath } from '@/server/services/space-routes';
import { env } from '@/server/config';
import * as publicContent from '@/server/services/public-content';

const SOURCE_PROVIDER = 'agent-memory-source-document';

type SourceMetadata = {
  provider: string;
  sourcePath: string;
  sourceDigest: string;
  sourceVersion?: string;
  deliveryIdempotencyKey?: string;
  recordType: 'source_document';
};

function rawContext(ctx: PermCtx): PermCtx {
  if (ctx.actor.kind !== 'api_key') throw new DomainError('UNAUTHORIZED', 'A dedicated Agent memory API key is required');
  return { actor: { ...ctx.actor, scopes: Array.from(new Set([...ctx.actor.scopes, 'view', 'create'])) } };
}

function sourceKey(sourcePath: string): string {
  return `source-document:${createHash('sha256').update(sourcePath.normalize('NFKC').toLocaleLowerCase()).digest('hex')}`;
}

function safeSegment(value: string): string {
  const normalized = value.normalize('NFKC').toLocaleLowerCase().replace(/[^a-z0-9_-]+/gu, '-').replace(/^-+|-+$/gu, '');
  return normalized || 'document';
}

function storagePath(access: AgentMemoryAccess, sourcePath: string): string {
  const digest = createHash('sha256').update(sourcePath.normalize('NFKC').toLocaleLowerCase()).digest('hex').slice(0, 16);
  const withoutExtension = sourcePath.slice(0, -3);
  const segments = withoutExtension.split('/').map(safeSegment);
  const prefix = `agent-memory/${access.namespaceId}/memory-wiki`;
  const leaf = `${segments.pop() ?? 'document'}-${digest}`;
  const candidate = `${prefix}/${segments.length > 0 ? `${segments.join('/')}/` : ''}${leaf}`;
  if (candidate.length <= 200) return candidate;
  return `${prefix}/${digest}`;
}

function readerSlug(access: AgentMemoryAccess, sourcePath: string): string {
  return storagePath(access, sourcePath);
}

function titleFor(sourcePath: string): string {
  const filename = sourcePath.split('/').pop()?.replace(/\.md$/iu, '') ?? 'Memory Wiki document';
  return filename.replace(/[-_]+/gu, ' ').trim().slice(0, 160) || 'Memory Wiki document';
}

function actualDigest(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

async function getRawSpace() {
  const space = await resolveSpace('raw');
  if (!space || space.kind !== 'raw') throw new DomainError('AGENT_MEMORY_NAMESPACE_UNAVAILABLE', 'The shared Raw space is unavailable');
  return space;
}

async function currentView(record: typeof schema.agentMemoryRecords.$inferSelect, outcome: 'created' | 'updated' | 'unchanged') {
  const [page, revision, space] = await Promise.all([
    db.query.pages.findFirst({ where: and(eq(schema.pages.id, record.pageId), isNull(schema.pages.deletedAt)) }),
    db.query.pageRevisions.findFirst({ where: eq(schema.pageRevisions.id, record.currentRevisionId) }),
    getRawSpace(),
  ]);
  if (!page || !revision || page.spaceId !== space.id || revision.status !== 'published') {
    throw new DomainError('AGENT_MEMORY_RECORD_NOT_FOUND', 'The source document is unavailable');
  }
  const metadata = (revision.sourceMetadata ?? {}) as Partial<SourceMetadata>;
  if (!metadata.sourcePath) throw new DomainError('AGENT_MEMORY_RECORD_NOT_FOUND', 'The source document provenance is unavailable');
  const citation = {
    pageId: page.id,
    revisionId: revision.id,
    revisionHash: revision.contentHash,
    title: page.title,
    canonicalUrl: new URL(canonicalSpacePath(space, page.slug), env.APP_URL).toString(),
    createdAt: revision.createdAt.toISOString(),
    sourcePath: metadata.sourcePath,
    storagePath: page.path,
  };
  return {
    memoryRecordId: record.id,
    pageId: page.id,
    revisionId: revision.id,
    sourcePath: metadata.sourcePath,
    storagePath: page.path,
    title: page.title,
    revisionHash: revision.contentHash,
    outcome,
    citation,
  };
}

async function existing(access: AgentMemoryAccess, sourcePath: string) {
  return db.query.agentMemoryRecords.findFirst({
    where: and(
      eq(schema.agentMemoryRecords.namespaceId, access.namespaceId),
      eq(schema.agentMemoryRecords.agentIdentity, access.agentIdentity),
      eq(schema.agentMemoryRecords.recordType, 'source_document'),
      eq(schema.agentMemoryRecords.idempotencyKey, sourceKey(sourcePath)),
      eq(schema.agentMemoryRecords.state, 'active'),
    ),
  });
}

export async function upsertSourceDocument(ctx: PermCtx, rawInput: AgentMemorySourceDocumentInput) {
  const input = agentMemorySourceDocumentInputSchema.parse(rawInput);
  if (actualDigest(input.content) !== input.sourceDigest) throw new DomainError('CONFLICT', 'Source digest does not match content');
  const access = await requireAgentMemoryAccess(ctx, 'memory.write', 'mirror');
  const current = await existing(access, input.sourcePath);
  if (current) {
    const revision = await db.query.pageRevisions.findFirst({ where: eq(schema.pageRevisions.id, current.currentRevisionId) });
    const metadata = (revision?.sourceMetadata ?? {}) as Partial<SourceMetadata>;
    if (metadata.sourcePath !== input.sourcePath) throw new DomainError('CONFLICT', 'Source paths differ only by case or normalization');
    if (input.idempotencyKey && metadata.deliveryIdempotencyKey === input.idempotencyKey && metadata.sourceDigest !== input.sourceDigest) {
      throw new DomainError('CONFLICT', 'The idempotency key is already associated with different content');
    }
    if (metadata.sourceDigest === input.sourceDigest) return currentView(current, 'unchanged');
    const replaced = await rawEntries.replaceEntry(rawContext(ctx), current.pageId, {
      content: input.content,
      inputKind: 'manual-note',
      source: { provider: SOURCE_PROVIDER },
      additionalSourceMetadata: {
        sourcePath: input.sourcePath,
        sourceDigest: input.sourceDigest,
        sourceVersion: input.sourceVersion,
        deliveryIdempotencyKey: input.idempotencyKey,
        recordType: 'source_document',
      },
    });
    const [updated] = await db.update(schema.agentMemoryRecords).set({ currentRevisionId: replaced.versionId, updatedAt: new Date() })
      .where(eq(schema.agentMemoryRecords.id, current.id)).returning();
    if (!updated) throw new DomainError('AGENT_MEMORY_RECORD_NOT_FOUND', 'The source document disappeared during update');
    return currentView(updated, 'updated');
  }

  const createdPage = await rawEntries.createEntry(rawContext(ctx), {
    path: storagePath(access, input.sourcePath),
    slug: readerSlug(access, input.sourcePath),
    title: titleFor(input.sourcePath),
    inputKind: 'manual-note',
    source: { provider: SOURCE_PROVIDER },
    additionalSourceMetadata: {
      sourcePath: input.sourcePath,
      sourceDigest: input.sourceDigest,
      sourceVersion: input.sourceVersion,
      deliveryIdempotencyKey: input.idempotencyKey,
      recordType: 'source_document',
    },
    content: input.content,
    visibility: 'restricted',
    categoryId: undefined,
  });
  try {
    const [record] = await db.insert(schema.agentMemoryRecords).values({
      id: randomUUID(),
      namespaceId: access.namespaceId,
      agentIdentity: access.agentIdentity,
      recordType: 'source_document',
      pageId: createdPage.pageId,
      currentRevisionId: createdPage.versionId,
      idempotencyKey: sourceKey(input.sourcePath),
    }).returning();
    if (!record) throw new Error('AGENT_MEMORY_SOURCE_DOCUMENT_INSERT_FAILED');
    return currentView(record, 'created');
  } catch (error) {
    const winner = await existing(access, input.sourcePath);
    if (winner) return currentView(winner, 'unchanged');
    throw error;
  }
}

export async function getMirrorConnection(ctx: PermCtx) {
  const access = await requireAgentMemoryAccess(ctx, 'memory.write', 'mirror');
  await getRawSpace();
  return {
    apiVersion: 'v1' as const,
    provider: 'next-wiki' as const,
    bindingPurpose: 'mirror' as const,
    namespace: { id: access.namespaceId, displayName: access.namespaceName, state: 'active' as const, agentIdentity: access.agentIdentity },
    capabilities: { mirror: true, immutableRevisions: true, currentOnly: true },
    limits: { maxPathCharacters: 400, maxContentCharacters: 512_000 },
  };
}

export async function searchKnowledge(ctx: PermCtx, query: string, limit: number) {
  await requireAgentMemoryAccess(ctx, 'view', 'knowledge_search');
  const result = await publicContent.searchPages(ctx, {
    q: query,
    scope: 'all',
    status: 'published',
    space: 'all',
    limit,
    include: ['latestRevision'],
    excerptLength: 240,
    order: 'relevance',
  });
  const items = result.items.map((item) => ({
    pageId: item.page.id,
    revisionId: item.page.latestRevision?.id ?? item.page.publishedRevision?.id,
    revisionHash: item.page.latestRevision?.contentHash ?? item.page.publishedRevision?.contentHash,
    space: item.page.spaceSlug as 'wiki' | 'raw' | 'generated',
    title: item.page.title,
    path: item.page.path,
    excerpt: item.excerpt ?? '',
    score: item.score ?? 0,
    canonicalUrl: item.page.canonicalUrl ?? '',
  }));
  const actor = ctx.actor;
  const coverage = {
    wiki: true,
    raw: actor.kind === 'api_key' && actor.spaceAccess.includes('raw'),
    generated: actor.kind === 'api_key' && actor.spaceAccess.includes('generated'),
  };
  return {
    results: items.filter((item): item is typeof item & { revisionId: string; revisionHash: string } => Boolean(item.revisionId && item.revisionHash)),
    coverage: { ...coverage, complete: coverage.raw && coverage.generated },
  };
}

export async function readKnowledgePage(ctx: PermCtx, pageId: string, maxChars = 8_000) {
  await requireAgentMemoryAccess(ctx, 'view', 'knowledge_search');
  const page = await publicContent.getPageById(ctx, pageId, ['latestRevision']);
  if (!page || !page.contentSource) throw new DomainError('NOT_FOUND', 'Page not found');
  const bounded = page.contentSource.slice(0, maxChars);
  const revision = page.latestRevision ?? page.publishedRevision;
  return {
    pageId: page.id,
    space: page.spaceSlug as 'wiki' | 'raw' | 'generated',
    path: page.path,
    title: page.title,
    content: bounded,
    truncated: bounded.length < page.contentSource.length,
    canonicalUrl: page.canonicalUrl ?? '',
    revisionId: revision?.id ?? null,
    revisionHash: revision?.contentHash ?? null,
  };
}
