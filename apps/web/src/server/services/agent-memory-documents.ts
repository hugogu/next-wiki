import { createHash, randomUUID } from 'node:crypto';
import { posix } from 'node:path';
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
import { resolveSpace, type SpaceKind } from '@/server/services/spaces';
import { canonicalSpacePath } from '@/server/services/space-routes';
import { env } from '@/server/config';
import * as publicContent from '@/server/services/public-content';
import { parseFrontmatter } from '@/server/metadata/frontmatter';
import { agentMemoryPathSegment } from '@/server/services/agent-memory-path';

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

function readableFilename(sourcePath: string): string {
  const filename = sourcePath.split('/').pop()?.replace(/\.md$/iu, '') ?? 'Memory Wiki document';
  return filename
    .replace(/^bridge[-_ ]workspace[-_ ]+[a-z0-9]+[-_ ]+memory[-_ ]+/iu, '')
    .replace(/(?:[-_ ]+[a-f0-9]{8,})+$/iu, '')
    .replace(/[-_]+/gu, ' ')
    .trim();
}

function storagePath(access: AgentMemoryAccess, sourcePath: string): string {
  // The readable namespace folder is not globally unique. Keep the namespace
  // id in the leaf digest so two spaces with the same display name cannot
  // collide while the tree remains readable at its first level.
  const digest = createHash('sha256')
    .update(`${access.namespaceId}:${sourcePath.normalize('NFKC').toLocaleLowerCase()}`)
    .digest('hex')
    .slice(0, 16);
  const isMemoryCore = sourcePath === 'memory-core' || sourcePath.startsWith('memory-core/');
  const relativeSourcePath = isMemoryCore ? sourcePath.slice('memory-core/'.length) : sourcePath;
  const segments = relativeSourcePath.replace(/\.md$/iu, '').split('/').map(safeSegment);
  const folder = agentMemoryPathSegment(access.namespaceName) || agentMemoryPathSegment(access.keyName) || 'memory';
  const prefix = `agent-memory/${folder}/${isMemoryCore ? 'memory-core' : 'memory-wiki'}`;
  segments.pop();
  const compactLeaf = safeSegment(readableFilename(sourcePath)).slice(0, 96);
  const leaf = `${compactLeaf}-${digest.slice(0, 8)}`;
  const candidate = `${prefix}/${segments.length > 0 ? `${segments.join('/')}/` : ''}${leaf}`;
  if (candidate.length <= 200) return candidate;
  return `${prefix}/${digest}`;
}

function readerSlug(access: AgentMemoryAccess, sourcePath: string): string {
  return storagePath(access, sourcePath);
}

function titleFor(sourcePath: string, content: string): string {
  const parsed = parseFrontmatter(content);
  const frontmatterTitle = parsed.frontmatter?.title;
  if (typeof frontmatterTitle === 'string' && frontmatterTitle.trim()) return frontmatterTitle.trim().slice(0, 160);

  const heading = /^(?:#{1,6})\s+(.+?)\s*#*\s*$/mu.exec(parsed.body)?.[1]?.trim();
  if (heading) return heading.slice(0, 160);

  return readableFilename(sourcePath).slice(0, 160) || 'Memory Wiki document';
}

/**
 * Resolve a relative Memory Wiki Markdown link to the mirrored Raw page. The
 * authored Markdown is kept unchanged in the revision; only stored HTML gets
 * the canonical next-wiki URL so index/source links remain usable in the UI.
 */
export function resolveSourceDocumentLink(
  access: AgentMemoryAccess,
  space: Awaited<ReturnType<typeof getRawSpace>>,
  sourcePath: string,
  href: string,
): string | null {
  const match = /^([^?#]*)([?#].*)?$/u.exec(href);
  const target = match?.[1] ?? '';
  if (
    !target ||
    target.startsWith('/') ||
    /^(?:[a-z][a-z\d+.-]*:|\/\/)/iu.test(target) ||
    !target.toLocaleLowerCase().endsWith('.md')
  ) return null;

  let decodedTarget = target;
  try {
    decodedTarget = decodeURIComponent(target);
  } catch {
    // Keep the original target when a producer emitted an invalid escape.
  }
  const resolved = posix.normalize(posix.join(posix.dirname(sourcePath), decodedTarget));
  if (resolved === '..' || resolved.startsWith('../') || resolved.startsWith('/')) return null;
  return `${canonicalSpacePath(space, storagePath(access, resolved))}${match?.[2] ?? ''}`;
}

function actualDigest(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

async function resolvePageSpaceKind(spaceSlug: string): Promise<SpaceKind> {
  const space = await resolveSpace(spaceSlug);
  if (!space) throw new DomainError('NOT_FOUND', 'Page not found');
  return space.kind;
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
  const access = await requireAgentMemoryAccess(ctx, 'memory.write', 'any');
  const current = await existing(access, input.sourcePath);
  if (current) {
    const revision = await db.query.pageRevisions.findFirst({ where: eq(schema.pageRevisions.id, current.currentRevisionId) });
    const metadata = (revision?.sourceMetadata ?? {}) as Partial<SourceMetadata>;
    if (metadata.sourcePath !== input.sourcePath) throw new DomainError('CONFLICT', 'Source paths differ only by case or normalization');
    if (input.idempotencyKey && metadata.deliveryIdempotencyKey === input.idempotencyKey && metadata.sourceDigest !== input.sourceDigest) {
      throw new DomainError('CONFLICT', 'The idempotency key is already associated with different content');
    }
    const space = await getRawSpace();
    await rawEntries.relocateMirroredEntry(rawContext(ctx), current.pageId, {
      path: storagePath(access, input.sourcePath),
      slug: readerSlug(access, input.sourcePath),
      title: titleFor(input.sourcePath, input.content),
    });
    const replaced = await rawEntries.replaceEntry(rawContext(ctx), current.pageId, {
      content: input.content,
      title: titleFor(input.sourcePath, input.content),
      inputKind: 'manual-note',
      source: { provider: SOURCE_PROVIDER },
      additionalSourceMetadata: {
        sourcePath: input.sourcePath,
        sourceDigest: input.sourceDigest,
        sourceVersion: input.sourceVersion,
        deliveryIdempotencyKey: input.idempotencyKey,
        recordType: 'source_document',
      },
      renderOptions: {
        resolveMarkdownLink: (href) => resolveSourceDocumentLink(access, space, input.sourcePath, href),
      },
    });
    if (replaced.unchanged) return currentView(current, 'unchanged');
    const [updated] = await db.update(schema.agentMemoryRecords).set({ currentRevisionId: replaced.versionId, updatedAt: new Date() })
      .where(eq(schema.agentMemoryRecords.id, current.id)).returning();
    if (!updated) throw new DomainError('AGENT_MEMORY_RECORD_NOT_FOUND', 'The source document disappeared during update');
    return currentView(updated, 'updated');
  }

  const space = await getRawSpace();
  const createdPage = await rawEntries.createEntry(rawContext(ctx), {
    path: storagePath(access, input.sourcePath),
    slug: readerSlug(access, input.sourcePath),
    title: titleFor(input.sourcePath, input.content),
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
    renderOptions: {
      resolveMarkdownLink: (href) => resolveSourceDocumentLink(access, space, input.sourcePath, href),
    },
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
  const access = await requireAgentMemoryAccess(ctx, 'memory.write', 'any');
  await getRawSpace();
  return {
    apiVersion: 'v1' as const,
    provider: 'next-wiki' as const,
    bindingPurpose: access.bindingPurpose,
    namespace: { id: access.namespaceId, displayName: access.namespaceName, state: 'active' as const, agentIdentity: access.agentIdentity },
    capabilities: { mirror: true, immutableRevisions: true, currentOnly: true },
    limits: { maxPathCharacters: 400, maxContentCharacters: 512_000 },
  };
}

export async function searchKnowledge(ctx: PermCtx, query: string, limit: number) {
  await requireAgentMemoryAccess(ctx, 'view', 'any');
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
  const items = await Promise.all(result.items.map(async (item) => ({
    pageId: item.page.id,
    revisionId: item.page.latestRevision?.id ?? item.page.publishedRevision?.id,
    revisionHash: item.page.latestRevision?.contentHash ?? item.page.publishedRevision?.contentHash,
    space: await resolvePageSpaceKind(item.page.spaceSlug),
    title: item.page.title,
    path: item.page.path,
    excerpt: item.excerpt ?? '',
    score: item.score ?? 0,
    canonicalUrl: item.page.canonicalUrl ?? '',
  })));
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
  await requireAgentMemoryAccess(ctx, 'view', 'any');
  const page = await publicContent.getPageById(ctx, pageId, ['latestRevision']);
  if (!page || !page.contentSource) throw new DomainError('NOT_FOUND', 'Page not found');
  const bounded = page.contentSource.slice(0, maxChars);
  const revision = page.latestRevision ?? page.publishedRevision;
  return {
    pageId: page.id,
    space: await resolvePageSpaceKind(page.spaceSlug),
    path: page.path,
    title: page.title,
    content: bounded,
    truncated: bounded.length < page.contentSource.length,
    canonicalUrl: page.canonicalUrl ?? '',
    revisionId: revision?.id ?? null,
    revisionHash: revision?.contentHash ?? null,
  };
}
