import { mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createHash, randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db, closeDb } from '@/server/db';
import * as schema from '@/server/db/schema';
import { buildPublishableSet } from './eligibility';
import { buildSnapshot, EmptySnapshotError, PathConflictError } from './snapshot';
import { preflightSnapshot, SnapshotTooLargeError } from './preflight';

const BASE_URL = 'https://owner.github.io/repo/';
let authorId: string;
const dirs: string[] = [];

async function stage(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'static-site-snapshot-'));
  dirs.push(dir);
  return dir;
}

async function makeSpace(slug: string, kind: 'wiki' | 'raw' | 'generated' = 'wiki', anonymousRead = true) {
  const [space] = await db
    .insert(schema.spaces)
    .values({ slug, name: slug, kind, anonymousRead })
    .returning();
  return space!.id;
}

async function makePage(options: {
  spaceId: string;
  path: string;
  title: string;
  body?: string;
  locale?: string;
  visibility?: 'public' | 'restricted';
  translationGroupId?: string | null;
}) {
  const [page] = await db
    .insert(schema.pages)
    .values({
      spaceId: options.spaceId,
      slug: options.path.split('/').pop()!,
      path: options.path,
      locale: options.locale ?? 'en',
      title: options.title,
      authorId,
      visibility: options.visibility ?? 'public',
      translationGroupId: options.translationGroupId ?? null,
    })
    .returning();
  const body = options.body ?? `# ${options.title}\n\nBody of ${options.title}.`;
  const [revision] = await db
    .insert(schema.pageRevisions)
    .values({
      pageId: page!.id,
      versionNumber: 1,
      contentSource: body,
      contentHtml: '<p>placeholder</p>',
      contentHash: createHash('sha256').update(body).digest('hex'),
      status: 'published',
      publishedAt: new Date(),
      authorId,
    })
    .returning();
  await db
    .update(schema.pages)
    .set({ latestVersionId: revision!.id, currentPublishedVersionId: revision!.id })
    .where(eq(schema.pages.id, page!.id));
  return { pageId: page!.id, revisionId: revision!.id };
}

async function clearContent() {
  await db.update(schema.pages).set({ currentPublishedVersionId: null, latestVersionId: null });
  await db.delete(schema.contentAssetRefs);
  await db.delete(schema.pageRevisions);
  await db.delete(schema.pages);
  await db.delete(schema.spaces);
}

/** Every file in the artifact, as text where possible. */
async function readArtifact(root: string): Promise<{ path: string; text: string }[]> {
  const out: { path: string; text: string }[] = [];
  const walk = async (dir: string): Promise<void> => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) await walk(full);
      else out.push({ path: relative(root, full), text: await readFile(full, 'utf8') });
    }
  };
  await walk(root);
  return out;
}

async function snapshot(rootDir: string) {
  return buildSnapshot({
    rootDir,
    baseUrl: BASE_URL,
    siteName: 'Test Wiki',
    themeCss: '.prose.prose{line-height:1.75}',
  });
}

beforeAll(async () => {
  await clearContent();
  await db.delete(schema.users);
  const [author] = await db
    .insert(schema.users)
    .values({ email: 'snap@example.com', passwordHash: 'HASH', role: 'admin' })
    .returning();
  authorId = author!.id;
});

afterEach(async () => {
  await clearContent();
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

afterAll(async () => {
  await db.delete(schema.users);
  await closeDb();
});

describe('artifact layout', () => {
  it('writes a document per page plus the site-level files', async () => {
    const space = await makeSpace('wiki');
    await makePage({ spaceId: space, path: 'guides/setup', title: 'Setup' });
    await makePage({ spaceId: space, path: 'about', title: 'About' });

    const root = await stage();
    const manifest = await snapshot(root);

    const paths = manifest.documents.map((doc) => doc.filePath).sort();
    expect(paths).toEqual(
      ['.nojekyll', '404.html', 'about/index.html', 'guides/setup/index.html', 'index.html', 'sitemap.xml'].sort(),
    );
    expect(manifest.pagesPublished).toBe(2);
  });

  it('writes .nojekyll so the host serves files without building them', async () => {
    const space = await makeSpace('wiki');
    await makePage({ spaceId: space, path: 'a', title: 'A' });
    const root = await stage();
    await snapshot(root);
    await expect(stat(join(root, '.nojekyll'))).resolves.toBeTruthy();
  });

  it('resolves every internal reference against the configured sub-path', async () => {
    const space = await makeSpace('wiki');
    await makePage({ spaceId: space, path: 'a', title: 'A' });
    const root = await stage();
    await snapshot(root);

    const html = await readFile(join(root, 'a', 'index.html'), 'utf8');
    expect(html).toContain('href="/repo/_static/site.css"');
    expect(html).toContain('src="/repo/_static/site.js"');
    expect(html).toContain('<link rel="canonical" href="https://owner.github.io/repo/a/"');
  });

  it('lists only published addresses in the sitemap', async () => {
    const space = await makeSpace('wiki');
    await makePage({ spaceId: space, path: 'public', title: 'Public' });
    await makePage({ spaceId: space, path: 'secret', title: 'Secret', visibility: 'restricted' });

    const root = await stage();
    await snapshot(root);
    const sitemap = await readFile(join(root, 'sitemap.xml'), 'utf8');
    expect(sitemap).toContain('https://owner.github.io/repo/public/');
    expect(sitemap).not.toContain('secret');
  });

  it('emits each locale at its own address', async () => {
    const space = await makeSpace('wiki');
    const group = randomUUID();
    await makePage({ spaceId: space, path: 'guides/setup', title: 'Setup', locale: 'en', translationGroupId: group });
    await makePage({ spaceId: space, path: 'guides/setup', title: '安装', locale: 'zh', translationGroupId: group });

    const root = await stage();
    await snapshot(root);
    await expect(stat(join(root, 'guides', 'setup', 'index.html'))).resolves.toBeTruthy();
    await expect(stat(join(root, 'zh', 'guides', 'setup', 'index.html'))).resolves.toBeTruthy();

    // The switcher offers the sibling that exists, in both directions.
    const en = await readFile(join(root, 'guides', 'setup', 'index.html'), 'utf8');
    expect(en).toContain('/repo/zh/guides/setup/');
    const zh = await readFile(join(root, 'zh', 'guides', 'setup', 'index.html'), 'utf8');
    expect(zh).toContain('/repo/guides/setup/');
    expect(zh).toContain('<html lang="zh">');
  });

  it('renders content through the wiki pipeline, keeping code and math markers', async () => {
    const space = await makeSpace('wiki');
    await makePage({
      spaceId: space,
      path: 'rich',
      title: 'Rich',
      body: '# Rich\n\n```js\nconst a = 1;\n```\n\n$E = mc^2$\n\n```mermaid\ngraph TD;\nA-->B;\n```\n',
    });

    const root = await stage();
    await snapshot(root);
    const html = await readFile(join(root, 'rich', 'index.html'), 'utf8');
    expect(html).toContain('data-code-block');
    expect(html).toContain('data-mermaid-block');
    expect(html).toContain('katex');
  });

  it('gives headings ids and builds a table of contents from them', async () => {
    const space = await makeSpace('wiki');
    await makePage({
      spaceId: space,
      path: 'toc',
      title: 'Toc',
      body: '# Toc\n\n## First section\n\ntext\n\n## Second section\n\ntext\n',
    });

    const root = await stage();
    await snapshot(root);
    const html = await readFile(join(root, 'toc', 'index.html'), 'utf8');
    expect(html).toMatch(/<h2[^>]*id="first-section"/);
    expect(html).toContain('href="#first-section"');
  });
});

describe('link handling', () => {
  it('rewrites a link to a published page and downgrades one to a restricted page', async () => {
    const space = await makeSpace('wiki');
    await makePage({ spaceId: space, path: 'target', title: 'Target' });
    await makePage({ spaceId: space, path: 'hidden', title: 'Hidden Title', visibility: 'restricted' });
    await makePage({
      spaceId: space,
      path: 'source',
      title: 'Source',
      body: '# Source\n\n[ok](/target) and [nope](/hidden)\n',
    });

    const root = await stage();
    const manifest = await snapshot(root);
    const html = await readFile(join(root, 'source', 'index.html'), 'utf8');

    expect(html).toContain('href="/repo/target/"');
    expect(html).toContain('data-unpublished-link');
    // The downgraded link keeps its visible text but discloses no address.
    expect(html).toContain('>nope</span>');
    expect(html).not.toContain('href="/hidden"');
    expect(manifest.linksDowngraded).toBe(1);
  });
});

describe('non-disclosure', () => {
  it('leaks nothing about ineligible pages anywhere in the artifact', async () => {
    // The release-blocking assertion: a mixed wiki with cross-links into every
    // kind of excluded content, scanned byte by byte.
    const open = await makeSpace('wiki-open', 'wiki', true);
    const closed = await makeSpace('wiki-closed', 'wiki', false);
    const raw = await makeSpace('raw-space', 'raw', true);
    const generated = await makeSpace('generated-space', 'generated', true);

    await makePage({
      spaceId: open,
      path: 'index-page',
      title: 'Index Page',
      body: '# Index\n\n[a](/classified-roadmap) [b](/internal-handbook) [c](/chat-transcript) [d](/ai-draft)\n',
    });
    await makePage({ spaceId: open, path: 'classified-roadmap', title: 'CLASSIFIED ROADMAP', visibility: 'restricted' });
    await makePage({ spaceId: closed, path: 'internal-handbook', title: 'INTERNAL HANDBOOK' });
    await makePage({ spaceId: raw, path: 'chat-transcript', title: 'CHAT TRANSCRIPT' });
    await makePage({ spaceId: generated, path: 'ai-draft', title: 'AI DRAFT' });

    const root = await stage();
    await snapshot(root);
    const files = await readArtifact(root);
    const everything = files.map((file) => file.text).join('\n');

    for (const forbidden of [
      'CLASSIFIED ROADMAP',
      'INTERNAL HANDBOOK',
      'CHAT TRANSCRIPT',
      'AI DRAFT',
      'classified-roadmap',
      'internal-handbook',
      'chat-transcript',
      'ai-draft',
    ]) {
      expect(everything, `"${forbidden}" must not appear in the artifact`).not.toContain(forbidden);
    }
  });
});

describe('guards', () => {
  it('refuses to publish an empty site rather than silently wiping a live one', async () => {
    // FR-004 replaces the branch wholesale, so an empty set would take the site
    // down. Removing a site is legitimate but is a different, confirmed action.
    await makeSpace('wiki-closed', 'wiki', false);
    const root = await stage();
    await expect(snapshot(root)).rejects.toBeInstanceOf(EmptySnapshotError);
  });

  it('fails with both paths named when two differ only in case', async () => {
    const space = await makeSpace('wiki');
    await makePage({ spaceId: space, path: 'Guides/Setup', title: 'Upper' });
    await makePage({ spaceId: space, path: 'guides/setup', title: 'Lower' });

    const root = await stage();
    const error = await snapshot(root).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(PathConflictError);
    expect((error as Error).message).toContain('guides/setup');
    expect((error as Error).message).toContain('Guides/Setup');
  });

  it('fails when a page claims a reserved artifact prefix', async () => {
    const space = await makeSpace('wiki');
    await makePage({ spaceId: space, path: '_assets/logo', title: 'Logo' });
    const root = await stage();
    await expect(snapshot(root)).rejects.toBeInstanceOf(PathConflictError);
  });
});

describe('preflight', () => {
  it('accepts a snapshot within the limits', async () => {
    const space = await makeSpace('wiki');
    await makePage({ spaceId: space, path: 'a', title: 'A' });
    const root = await stage();
    const manifest = await snapshot(root);
    expect(() => preflightSnapshot(manifest)).not.toThrow();
  });

  it('rejects an oversized snapshot before anything is delivered', async () => {
    const space = await makeSpace('wiki');
    await makePage({ spaceId: space, path: 'a', title: 'A' });
    const root = await stage();
    const manifest = await snapshot(root);
    expect(() => preflightSnapshot(manifest, { maxTotalBytes: 10 })).toThrow(SnapshotTooLargeError);
  });

  it('names the per-file limit when a single file is too large', async () => {
    const space = await makeSpace('wiki');
    await makePage({ spaceId: space, path: 'a', title: 'A' });
    const root = await stage();
    const manifest = await snapshot(root);
    expect(() => preflightSnapshot(manifest, { maxFileBytes: 10 })).toThrow(/per-file limit/);
  });
});

describe('publishable set integration', () => {
  it('publishes exactly the pages the eligibility query returns', async () => {
    const space = await makeSpace('wiki');
    await makePage({ spaceId: space, path: 'one', title: 'One' });
    await makePage({ spaceId: space, path: 'two', title: 'Two' });
    await makePage({ spaceId: space, path: 'three', title: 'Three', visibility: 'restricted' });

    const set = await buildPublishableSet();
    const root = await stage();
    const manifest = await snapshot(root);
    expect(manifest.pagesPublished).toBe(set.pages.length);
  });
});
