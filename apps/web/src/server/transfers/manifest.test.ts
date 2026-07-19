import { describe, expect, it } from 'vitest';
import {
  pageEntryPath,
  parsePage,
  serializePage,
  stableManifest,
  type PortablePageFrontmatter,
} from './manifest';

describe('portable archive manifest', () => {
  it('round trips YAML frontmatter and original Markdown', () => {
    const frontmatter: PortablePageFrontmatter = {
      nextWikiArchiveVersion: 2,
      sourcePageId: 'page-1',
      sourceRevisionId: 'revision-1',
      spaceKind: 'wiki',
      spaceSlug: 'default',
      path: 'engineering/auth',
      locale: 'en',
      title: 'Auth: "Guide"',
      contentType: 'text/markdown',
      contentHash: 'a'.repeat(64),
      publishedAt: '2026-06-21T00:00:00.000Z',
      createdAt: '2026-06-20T00:00:00.000Z',
      updatedAt: '2026-06-21T00:00:00.000Z',
      inputKind: null,
      rawSource: null,
    };
    const markdown = '# Heading\n\n![x](/api/assets/00000000-0000-0000-0000-000000000000)';
    const serialized = serializePage(frontmatter, markdown);
    const parsed = parsePage(serialized);
    expect(parsed.frontmatter).toMatchObject(frontmatter);
    expect(parsed.markdown).toBe(markdown);
  });

  it('encodes page path segments and sorts inventories deterministically', () => {
    expect(pageEntryPath('zh-CN', '目录/空 格')).toBe(
      'pages/zh-CN/%E7%9B%AE%E5%BD%95/%E7%A9%BA%20%E6%A0%BC.md',
    );
    const base = {
      format: 'next-wiki-portable' as const,
      version: 2 as const,
      createdAt: '2026-06-21T00:00:00.000Z',
      source: { instanceId: 'x', product: 'next-wiki' as const, version: '1', writingMode: 'llm-wiki' as const },
      snapshot: { capturedAt: '2026-06-21T00:00:00.000Z', spaces: [{ slug: 'default', kind: 'wiki' as const, pageCount: 0 }] },
      counts: { pages: 0, assets: 0 },
      pages: [],
      assets: [],
      files: [
        { entry: 'z', sha256: 'a'.repeat(64), sizeBytes: 1 },
        { entry: 'a', sha256: 'b'.repeat(64), sizeBytes: 1 },
      ],
    };
    expect(stableManifest(base).files.map((file) => file.entry)).toEqual(['a', 'z']);
  });
});
