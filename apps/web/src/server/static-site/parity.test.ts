import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db, closeDb } from '@/server/db';
import * as schema from '@/server/db/schema';
import { renderMarkdown } from '@/server/pipeline';
import { injectHeadingIds } from '@/lib/html';
import { buildSnapshot } from './snapshot';

/**
 * Rendering parity: the static document body must be the same HTML the reader
 * pipeline produces for the same revision, because the published site is not a
 * separate renderer. SC-003 claims 100% parity; this test asserts it for the
 * body markup rather than relying on visual inspection.
 */

const BASE_URL = 'https://owner.github.io/repo/';
let authorId: string;
const dirs: string[] = [];

async function stage(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'static-site-parity-'));
  dirs.push(dir);
  return dir;
}

async function makeSpace() {
  const [space] = await db
    .insert(schema.spaces)
    .values({ slug: 'wiki-parity', name: 'wiki-parity', kind: 'wiki', anonymousRead: true })
    .returning();
  return space!.id;
}

async function makePage(options: {
  spaceId: string;
  path: string;
  title: string;
  body: string;
  locale?: string;
}) {
  const rendered = renderMarkdown(options.body);
  const [page] = await db
    .insert(schema.pages)
    .values({
      spaceId: options.spaceId,
      slug: options.path.split('/').pop()!,
      path: options.path,
      locale: options.locale ?? 'en',
      title: options.title,
      authorId,
      visibility: 'public',
    })
    .returning();
  const [revision] = await db
    .insert(schema.pageRevisions)
    .values({
      pageId: page!.id,
      versionNumber: 1,
      contentSource: options.body,
      contentHtml: rendered.html,
      contentHash: createHash('sha256').update(options.body).digest('hex'),
      status: 'published',
      publishedAt: new Date(),
      authorId,
    })
    .returning();
  await db
    .update(schema.pages)
    .set({ latestVersionId: revision!.id, currentPublishedVersionId: revision!.id })
    .where(eq(schema.pages.id, page!.id));
  return { pageId: page!.id, revisionId: revision!.id, contentHtml: rendered.html };
}

async function clearContent() {
  await db.update(schema.pages).set({ currentPublishedVersionId: null, latestVersionId: null });
  await db.delete(schema.contentAssetRefs);
  await db.delete(schema.pageRevisions);
  await db.delete(schema.pages);
  await db.delete(schema.spaces);
}

/** Extract the raw inner HTML of the static body div without parsing/encoding. */
function extractStaticBody(html: string): string {
  const open = '<div class="prose max-w-none" data-pagefind-body>';
  const start = html.indexOf(open);
  if (start === -1) throw new Error('static body div not found');
  const contentStart = start + open.length;

  let depth = 1;
  let i = contentStart;
  while (i < html.length - 6 && depth > 0) {
    if (html[i] === '<' && html.slice(i, i + 4).toLowerCase() === '<div') {
      const next = html[i + 4];
      if (next === '>' || next === ' ' || next === '\t' || next === '\n' || next === '/') {
        depth += 1;
        i += 4;
        continue;
      }
    }
    if (html.slice(i, i + 6) === '</div>') {
      depth -= 1;
      if (depth === 0) return html.slice(contentStart, i);
      i += 6;
      continue;
    }
    i += 1;
  }
  throw new Error('could not find matching closing tag for static body div');
}

/** Normalize the static-site-only indexing hint so it does not affect parity. */
function normalizeForParity(html: string): string {
  return html.replace(/\sdata-pagefind-ignore=""/g, '').replace(/\sdata-pagefind-ignore/g, '');
}

beforeAll(async () => {
  await clearContent();
  await db.delete(schema.users);
  const [author] = await db
    .insert(schema.users)
    .values({ email: 'parity@example.com', passwordHash: 'HASH', role: 'admin' })
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

describe('rendering parity', () => {
  it('produces the same body HTML as the reader pipeline for a rich revision', async () => {
    const spaceId = await makeSpace();
    const body =
      '# Parity test\n\n' +
      'A paragraph with **bold** and _italic_ text.\n\n' +
      '## A section with code\n\n' +
      '```js\nconst x = 1;\n```\n\n' +
      '## A section with math\n\n' +
      '$E = mc^2$\n\n' +
      '## A section with a diagram\n\n' +
      '```mermaid\ngraph TD;\nA-->B;\n```\n\n' +
      '| A | B |\n|---|---|\n| 1 | 2 |\n';

    const { contentHtml } = await makePage({
      spaceId,
      path: 'parity',
      title: 'Parity Test',
      body,
    });

    const readerBody = injectHeadingIds(contentHtml);

    const root = await stage();
    await buildSnapshot({
      rootDir: root,
      baseUrl: BASE_URL,
      siteName: 'Parity Wiki',
      themeCss: '.prose.prose{line-height:1.75}',
      skipSearchIndex: true,
    });

    const staticHtml = await readFile(join(root, 'parity', 'index.html'), 'utf8');
    const staticBody = normalizeForParity(extractStaticBody(staticHtml));

    expect(staticBody).toBe(readerBody);
  });

  it('reuses the same heading ids as the reader pipeline', async () => {
    const spaceId = await makeSpace();
    const body = '# Parity headings\n\n## First section\n\n## Second section\n\n## First section\n';
    const { contentHtml } = await makePage({
      spaceId,
      path: 'headings',
      title: 'Heading Parity',
      body,
    });

    const readerBody = injectHeadingIds(contentHtml);
    expect(readerBody).toContain('id="first-section"');
    expect(readerBody).toContain('id="first-section-2"');

    const root = await stage();
    await buildSnapshot({
      rootDir: root,
      baseUrl: BASE_URL,
      siteName: 'Parity Wiki',
      themeCss: '',
      skipSearchIndex: true,
    });

    const staticHtml = await readFile(join(root, 'headings', 'index.html'), 'utf8');
    const staticBody = extractStaticBody(staticHtml);

    expect(staticBody).toContain('id="first-section"');
    expect(staticBody).toContain('id="first-section-2"');
    expect(staticBody).toBe(readerBody);
  });
});
