import { mkdtemp, readdir, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createHash, randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { JSDOM } from 'jsdom';
import { db, closeDb } from '@/server/db';
import * as schema from '@/server/db/schema';
import { buildSnapshot } from './snapshot';

/**
 * Dead-link scan: every internal href emitted by the static generator must
 * point at a file that actually exists in the artifact. SC-004 promises zero
 * dead links, so this is a mechanical check rather than a manual crawl.
 */

const BASE_URL = 'https://owner.github.io/repo/';
const BASE_PATH = '/repo/';
let authorId: string;
const dirs: string[] = [];

async function stage(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'static-site-dead-link-'));
  dirs.push(dir);
  return dir;
}

async function makeSpace() {
  const [space] = await db
    .insert(schema.spaces)
    .values({ slug: 'wiki-dead-link', name: 'wiki-dead-link', kind: 'wiki', anonymousRead: true })
    .returning();
  return space!.id;
}

async function makePage(options: {
  spaceId: string;
  path: string;
  title: string;
  body: string;
  locale?: string;
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
      visibility: 'public',
      translationGroupId: options.translationGroupId ?? null,
    })
    .returning();
  const [revision] = await db
    .insert(schema.pageRevisions)
    .values({
      pageId: page!.id,
      versionNumber: 1,
      contentSource: options.body,
      contentHtml: '<p>placeholder</p>',
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
  return { pageId: page!.id, revisionId: revision!.id };
}

async function clearContent() {
  await db.update(schema.pages).set({ currentPublishedVersionId: null, latestVersionId: null });
  await db.delete(schema.contentAssetRefs);
  await db.delete(schema.pageRevisions);
  await db.delete(schema.pages);
  await db.delete(schema.spaces);
}

async function listHtmlFiles(root: string): Promise<string[]> {
  const out: string[] = [];
  const walk = async (dir: string): Promise<void> => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (entry.name.endsWith('.html')) out.push(relative(root, full));
    }
  };
  await walk(root);
  return out;
}

const INFRASTRUCTURE_PREFIXES = ['_static/', '_assets/', 'pagefind/'];

function isInfrastructureHref(href: string, basePath: string): boolean {
  if (!href.startsWith(basePath)) return false;
  const relativePath = href.slice(basePath.length);
  return INFRASTRUCTURE_PREFIXES.some((prefix) => relativePath.startsWith(prefix));
}

function isExternal(href: string): boolean {
  return /^[a-z][a-z0-9+.-]*:|^\/\//i.test(href);
}

function isFragment(href: string): boolean {
  return href.startsWith('#');
}

function resolveArtifactPath(href: string, basePath: string): string | null {
  if (!href.startsWith(basePath)) return null;
  let relativePath = href.slice(basePath.length);
  // Strip hash fragment.
  const hashIndex = relativePath.indexOf('#');
  if (hashIndex !== -1) relativePath = relativePath.slice(0, hashIndex);
  // Strip query string.
  const queryIndex = relativePath.indexOf('?');
  if (queryIndex !== -1) relativePath = relativePath.slice(0, queryIndex);
  if (relativePath === '' || relativePath.endsWith('/')) {
    relativePath += 'index.html';
  }
  return relativePath;
}

beforeAll(async () => {
  await clearContent();
  await db.delete(schema.users);
  const [author] = await db
    .insert(schema.users)
    .values({ email: 'dead-link@example.com', passwordHash: 'HASH', role: 'admin' })
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

describe('dead-link scan', () => {
  it('resolves every internal href to a file in the artifact', async () => {
    const spaceId = await makeSpace();
    const groupSetup = randomUUID();
    const groupAbout = randomUUID();

    await makePage({
      spaceId,
      path: 'guides/setup',
      title: 'Setup',
      body: '# Setup\n\nSee [about](/about) or [configuration](#config).\n',
      locale: 'en',
      translationGroupId: groupSetup,
    });
    await makePage({
      spaceId,
      path: 'about',
      title: 'About',
      body: '# About\n\nBack to [setup](/guides/setup).\n',
      locale: 'en',
      translationGroupId: groupAbout,
    });
    await makePage({
      spaceId,
      path: 'guides/setup',
      title: '安装',
      body: '# 安装\n\n参见 [about](/about)。\n',
      locale: 'zh',
      translationGroupId: groupSetup,
    });
    await makePage({
      spaceId,
      path: 'about',
      title: '关于',
      body: '# 关于\n\n返回 [setup](/guides/setup)。\n',
      locale: 'zh',
      translationGroupId: groupAbout,
    });

    const root = await stage();
    await buildSnapshot({
      rootDir: root,
      baseUrl: BASE_URL,
      siteName: 'Dead Link Wiki',
      themeCss: '.prose.prose{line-height:1.75}',
      skipSearchIndex: true,
    });

    const htmlFiles = await listHtmlFiles(root);
    const failures: { file: string; href: string; resolved: string | null }[] = [];

    for (const file of htmlFiles) {
      const html = await readFile(join(root, file), 'utf8');
      const dom = new JSDOM(html);
      const links = dom.window.document.querySelectorAll('a[href], link[href]');
      for (const el of links) {
        const href = el.getAttribute('href') ?? '';
        if (isFragment(href) || isExternal(href) || isInfrastructureHref(href, BASE_PATH)) continue;
        const resolved = resolveArtifactPath(href, BASE_PATH);
        if (!resolved) {
          failures.push({ file, href, resolved: null });
          continue;
        }
        try {
          await stat(join(root, resolved));
        } catch {
          failures.push({ file, href, resolved });
        }
      }
    }

    expect(failures).toEqual([]);
  });

  it('reserves no dead link from navigation or language switcher', async () => {
    const spaceId = await makeSpace();
    const group = randomUUID();

    await makePage({
      spaceId,
      path: 'a',
      title: 'A',
      body: '# A\n',
      locale: 'en',
      translationGroupId: group,
    });
    await makePage({
      spaceId,
      path: 'a',
      title: '甲',
      body: '# 甲\n',
      locale: 'zh',
      translationGroupId: group,
    });

    const root = await stage();
    await buildSnapshot({
      rootDir: root,
      baseUrl: BASE_URL,
      siteName: 'Switch Wiki',
      themeCss: '',
      skipSearchIndex: true,
    });

    const htmlFiles = await listHtmlFiles(root);
    for (const file of htmlFiles) {
      const html = await readFile(join(root, file), 'utf8');
      const dom = new JSDOM(html);
      for (const el of dom.window.document.querySelectorAll('a[href], link[href]')) {
        const href = el.getAttribute('href') ?? '';
        if (isFragment(href) || isExternal(href) || isInfrastructureHref(href, BASE_PATH)) continue;
        const resolved = resolveArtifactPath(href, BASE_PATH);
        expect(resolved).not.toBeNull();
        await expect(stat(join(root, resolved!))).resolves.toBeDefined();
      }
    }
  });
});
