import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const access = {
  namespaceId: 'namespace-id',
  namespaceName: 'Personal memory',
  agentIdentity: 'openclaw',
  keyName: 'mirror',
  bindingPurpose: 'mirror',
} as const;
const dbMock = vi.hoisted(() => ({
  query: {
    agentMemoryRecords: { findFirst: vi.fn() },
    pages: { findFirst: vi.fn() },
    pageRevisions: { findFirst: vi.fn() },
  },
  insert: vi.fn(),
  update: vi.fn(),
}));
const requireAccess = vi.hoisted(() => vi.fn(async () => access));
const rawEntries = vi.hoisted(() => ({ createEntry: vi.fn(), replaceEntry: vi.fn(), relocateMirroredEntry: vi.fn() }));
const publicContent = vi.hoisted(() => ({ searchPages: vi.fn(), getPageById: vi.fn() }));
const resolveSpace = vi.hoisted(() => vi.fn(async (slug?: string) => slug === 'raw'
  ? { id: 'raw-space', kind: 'raw' as const, slug: 'raw' }
  : { id: 'wiki-space', kind: 'wiki' as const, slug: 'default' }));

vi.mock('@/server/db', () => ({ db: dbMock }));
vi.mock('@/server/permissions/agent-memory', () => ({ requireAgentMemoryAccess: requireAccess }));
vi.mock('@/server/services/raw-entries', () => rawEntries);
vi.mock('@/server/services/spaces', () => ({ resolveSpace }));
vi.mock('@/server/services/space-routes', () => ({ canonicalSpacePath: vi.fn(() => '/raw/agent-document') }));
vi.mock('@/server/config', () => ({ env: { APP_URL: 'https://wiki.example' } }));
vi.mock('@/server/services/public-content', () => publicContent);

import { readKnowledgePage, searchKnowledge, upsertSourceDocument } from './agent-memory-documents';

function digest(content: string) {
  return createHash('sha256').update(content).digest('hex');
}

describe('agent memory source documents', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAccess.mockResolvedValue(access);
    dbMock.query.agentMemoryRecords.findFirst.mockResolvedValue(undefined);
    dbMock.query.pages.findFirst.mockResolvedValue({ id: 'page-id', spaceId: 'raw-space', slug: 'agent-document', path: 'agent-memory/namespace-id/memory-wiki/entities/alex-abc', title: 'Alex', deletedAt: null });
    dbMock.query.pageRevisions.findFirst.mockResolvedValue({ id: 'revision-id', contentHash: 'a'.repeat(64), status: 'published', createdAt: new Date('2026-08-30T00:00:00Z'), sourceMetadata: { sourcePath: 'entities/alex.md', sourceDigest: digest('# Alex\n') } });
    rawEntries.createEntry.mockResolvedValue({ pageId: 'page-id', versionId: 'revision-id' });
    rawEntries.replaceEntry.mockResolvedValue({ pageId: 'page-id', versionId: 'revision-id', versionNumber: 1, unchanged: true });
    rawEntries.relocateMirroredEntry.mockResolvedValue({ changed: false, path: 'agent-memory/personal-memory/memory-wiki/entities/alex-abc', slug: 'agent-memory/personal-memory/memory-wiki/entities/alex-abc' });
    dbMock.insert.mockReturnValue({ values: vi.fn(() => ({ returning: vi.fn(async () => [{ id: 'memory-record-id', namespaceId: 'namespace-id', agentIdentity: 'openclaw', recordType: 'source_document', pageId: 'page-id', currentRevisionId: 'revision-id', idempotencyKey: 'source-key', state: 'active' }]) })) });
  });

  it('creates a source document on the shared Raw/Page/Revision pipeline and retains exact Markdown', async () => {
    const content = '---\ntags: [personal]\n---\n\n# Alex\n';
    dbMock.query.pageRevisions.findFirst.mockResolvedValue({ id: 'revision-id', contentHash: digest(content), status: 'published', createdAt: new Date('2026-08-30T00:00:00Z'), sourceMetadata: { sourcePath: 'entities/alex.md', sourceDigest: digest(content) } });

    const result = await upsertSourceDocument({ actor: { kind: 'api_key', scopes: ['memory.write'], keyId: 'mirror-key' } } as never, {
      sourcePath: 'entities/alex.md', content, sourceDigest: digest(content), idempotencyKey: `entities/alex.md:${digest(content)}`,
    });

    expect(result).toMatchObject({ outcome: 'created', sourcePath: 'entities/alex.md', pageId: 'page-id', revisionId: 'revision-id' });
    expect(rawEntries.createEntry).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      path: expect.stringContaining('agent-memory/personal-memory/memory-wiki/entities/alex-'),
      content,
      title: 'Alex',
      visibility: 'restricted',
    }));
    expect(rawEntries.createEntry.mock.calls[0]?.[1].additionalSourceMetadata).toMatchObject({ sourcePath: 'entities/alex.md', recordType: 'source_document' });
    const resolveMarkdownLink = rawEntries.createEntry.mock.calls[0]?.[1].renderOptions.resolveMarkdownLink;
    expect(resolveMarkdownLink('../sources/related.md#details')).toBe('/raw/agent-document#details');
    expect(resolveMarkdownLink('https://example.com/related.md')).toBeNull();
    expect(rawEntries.relocateMirroredEntry).not.toHaveBeenCalled();
  });

  it('returns unchanged for the current digest and writes a full replacement for changed content', async () => {
    const first = '# Alex\n';
    const second = '# Alex\n\nUpdated\n';
    const current = { id: 'memory-record-id', namespaceId: 'namespace-id', agentIdentity: 'openclaw', recordType: 'source_document', pageId: 'page-id', currentRevisionId: 'revision-id', idempotencyKey: 'source-key', state: 'active' };
    dbMock.query.agentMemoryRecords.findFirst.mockResolvedValue(current);
    dbMock.query.pageRevisions.findFirst.mockResolvedValue({ id: 'revision-id', contentHash: digest(first), status: 'published', createdAt: new Date('2026-08-30T00:00:00Z'), sourceMetadata: { sourcePath: 'entities/alex.md', sourceDigest: digest(first), deliveryIdempotencyKey: 'entities/alex.md:' + digest(first) } });

    await expect(upsertSourceDocument({ actor: { kind: 'api_key', scopes: ['memory.write'], keyId: 'mirror-key' } } as never, { sourcePath: 'entities/alex.md', content: first, sourceDigest: digest(first), idempotencyKey: 'entities/alex.md:' + digest(first) })).resolves.toMatchObject({ outcome: 'unchanged' });
    expect(rawEntries.replaceEntry).toHaveBeenCalledWith(expect.anything(), 'page-id', expect.objectContaining({ content: first, title: 'Alex' }));
    expect(rawEntries.relocateMirroredEntry).toHaveBeenCalledWith(expect.anything(), 'page-id', expect.objectContaining({
      path: expect.stringContaining('agent-memory/personal-memory/memory-wiki/entities/alex-'),
      title: 'Alex',
    }));

    rawEntries.replaceEntry.mockResolvedValue({ pageId: 'page-id', versionId: 'revision-2', versionNumber: 2, unchanged: false });
    dbMock.query.pageRevisions.findFirst
      .mockResolvedValueOnce({ id: 'revision-id', contentHash: digest(first), status: 'published', createdAt: new Date('2026-08-30T00:00:00Z'), sourceMetadata: { sourcePath: 'entities/alex.md', sourceDigest: digest(first) } })
      .mockResolvedValueOnce({ id: 'revision-2', contentHash: digest(second), status: 'published', createdAt: new Date('2026-08-30T00:00:00Z'), sourceMetadata: { sourcePath: 'entities/alex.md', sourceDigest: digest(second) } });
    dbMock.update.mockReturnValue({ set: vi.fn(() => ({ where: vi.fn(() => ({ returning: vi.fn(async () => [{ ...current, currentRevisionId: 'revision-2' }]) })) })) });

    await expect(upsertSourceDocument({ actor: { kind: 'api_key', scopes: ['memory.write'], keyId: 'mirror-key' } } as never, { sourcePath: 'entities/alex.md', content: second, sourceDigest: digest(second), idempotencyKey: 'entities/alex.md:' + digest(second) })).resolves.toMatchObject({ outcome: 'updated', revisionId: 'revision-2' });
    expect(rawEntries.replaceEntry).toHaveBeenCalledWith(expect.anything(), 'page-id', expect.objectContaining({ content: second, title: 'Alex' }));
  });

  it('searches only visible current revisions and reports incomplete space coverage', async () => {
    publicContent.searchPages.mockResolvedValue({ items: [{ page: { id: 'page-id', latestRevision: { id: 'revision-id', contentHash: 'a'.repeat(64) }, spaceSlug: 'default', title: 'Profile', path: 'profile', canonicalUrl: 'https://wiki.example/profile' }, excerpt: 'Alex', score: 1 }] });
    const result = await searchKnowledge({ actor: { kind: 'api_key', scopes: ['view'], spaceAccess: ['wiki'], keyId: 'knowledge-key' } } as never, 'Alex', 8);

    expect(publicContent.searchPages).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ space: 'all', include: ['latestRevision'], status: 'published' }));
    expect(result).toMatchObject({ coverage: { wiki: true, raw: false, generated: false, complete: false }, results: [{ revisionId: 'revision-id', space: 'wiki' }] });
  });

  it('bounds a selected page read and keeps the current revision citation', async () => {
    publicContent.getPageById.mockResolvedValue({ id: 'page-id', spaceSlug: 'default', path: 'profile', title: 'Profile', contentSource: '# Profile\nLong body', canonicalUrl: 'https://wiki.example/profile', latestRevision: { id: 'revision-id', contentHash: 'a'.repeat(64) } });
    const result = await readKnowledgePage({ actor: { kind: 'api_key', scopes: ['view'], spaceAccess: ['wiki'], keyId: 'knowledge-key' } } as never, 'page-id', 10);

    expect(result).toMatchObject({ pageId: 'page-id', revisionId: 'revision-id', truncated: true, content: '# Profile\n' });
    expect(result.space).toBe('wiki');
    expect(publicContent.getPageById).toHaveBeenCalledWith(expect.anything(), 'page-id', ['latestRevision']);
  });
});
