import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createHash, randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db, closeDb } from '@/server/db';
import * as schema from '@/server/db/schema';
import { encryptKey } from '@/server/crypto/key-encryption';
import { buildSnapshot } from './snapshot';

/**
 * Release-blocking non-disclosure assertion.
 *
 * One mixed fixture, one snapshot, one full traversal of the artifact: nothing
 * about an ineligible page — its title, path, excerpt, or referenced asset —
 * may appear in any file the host will serve. The same scan also enforces
 * FR-035's artifact clause: no credential material of any kind reaches the
 * artifact, whether stored against the target/integration or supplied through
 * a page body.
 *
 * A failure here is a release blocker, never a test to adjust. If this test
 * flags a leak, fix the publishing code so the artifact stops carrying it.
 */

const BASE_URL = 'https://owner.github.io/repo/';
let authorId: string;
const dirs: string[] = [];

async function stage(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'static-site-disclosure-'));
  dirs.push(dir);
  return dir;
}

async function makeSpace(
  slug: string,
  kind: 'wiki' | 'raw' | 'generated' = 'wiki',
  anonymousRead = true,
) {
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
  const body = options.body ?? `# ${options.title}\n\nBody of ${options.title}.`;
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
  return { pageId: page!.id, revisionId: revision!.id, body };
}

async function attachAsset(revisionId: string): Promise<string> {
  const [asset] = await db
    .insert(schema.contentAssets)
    .values({ kind: 'image', contentHash: randomUUID(), contentType: 'image/png', sizeBytes: 1 })
    .returning();
  await db.insert(schema.contentBlobs).values({ assetId: asset!.id, bytes: Buffer.from([0]) });
  await db
    .insert(schema.contentAssetRefs)
    .values({ assetId: asset!.id, revisionId });
  return asset!.id;
}

async function clearContent() {
  await db.update(schema.pages).set({ currentPublishedVersionId: null, latestVersionId: null });
  await db.delete(schema.contentAssetRefs);
  await db.delete(schema.contentBlobs);
  await db.delete(schema.contentAssets);
  await db.delete(schema.pageRevisions);
  await db.delete(schema.pages);
  await db.delete(schema.spaces);
  await db.delete(schema.staticSiteTargets);
  await db.delete(schema.integrations);
}

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

/** Credential material a publication must never let reach the artifact. */
const CREDENTIALS = {
  token: 'ghp_token_DO_NOT_LEAK_0123456789abcdef',
  password: 'p4ssw0rd-DO-NOT-LEAK',
  sshKey: '-----BEGIN OPENSSH PRIVATE KEY-----\nDO-NOT-LEAK\n-----END OPENSSH PRIVATE KEY-----',
  apiKeySecret: 'nwi_live_DO_NOT_LEAK_deadbeefcafebabe1234',
};

beforeAll(async () => {
  await clearContent();
  await db.delete(schema.users);
  const [author] = await db
    .insert(schema.users)
    .values({ email: 'leak@example.com', passwordHash: 'HASH', role: 'admin' })
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

describe('non-disclosure (release-blocking)', () => {
  it('carries no trace of any excluded page anywhere in the artifact', async () => {
    // The five FR-007 conditions, one example each, plus a credential-laden
    // integration and a few ineligible asset references. Every forbidden string
    // below is a label that, in the wiki, points at content the artifact must
    // not publish.
    const open = await makeSpace('wiki-open', 'wiki', true);
    const closed = await makeSpace('wiki-closed', 'wiki', false);
    const raw = await makeSpace('raw-space', 'raw', true);
    const generated = await makeSpace('generated-space', 'generated', true);

    // The published index page exists to make every ineligible page a link
    // target, so the rewriter must downgrade them all. Every forbidden string
    // below appears only in an excluded page, never in the index.
    const indexPage = await makePage({
      spaceId: open,
      path: 'index-page',
      title: 'Index Page',
      body:
        '# Index\n\n[classified](/classified-roadmap) [internal](/internal-handbook) ' +
        '[chat](/chat-transcript) [draft](/ai-draft) [gone](/vanished)\n',
    });

    const restricted = await makePage({
      spaceId: open,
      path: 'classified-roadmap',
      title: 'CLASSIFIED ROADMAP',
      visibility: 'restricted',
      body: '# CLASSIFIED ROADMAP\n\nQ3 launch details and PROJECT-GAMMA findings.\n',
    });
    const internal = await makePage({
      spaceId: closed,
      path: 'internal-handbook',
      title: 'INTERNAL HANDBOOK',
      body: '# INTERNAL HANDBOOK\n\nHiring policy, on-call rotations.\n',
    });
    const chat = await makePage({
      spaceId: raw,
      path: 'chat-transcript',
      title: 'CHAT TRANSCRIPT',
      body: '# CHAT TRANSCRIPT\n\n[10:00] someone: do not publish this\n',
    });
    const draft = await makePage({
      spaceId: generated,
      path: 'ai-draft',
      title: 'AI DRAFT',
      body: '# AI DRAFT\n\nUnreviewed summary content.\n',
    });
    const deleted = await makePage({
      spaceId: open,
      path: 'vanished',
      title: 'VANISHED PAGE',
      body: '# VANISHED PAGE\n\nA soft-deleted page that must not appear.\n',
    });
    await db
      .update(schema.pages)
      .set({ deletedAt: new Date() })
      .where(eq(schema.pages.id, deleted.pageId));

    // Asset used by a published page → expected inside the artifact (and not
    // on the forbidden list, since the scan accepts its id appearing there).
    await attachAsset(indexPage.revisionId);
    // Assets used only by excluded pages → must NOT show up.
    const restrictedAssetId = await attachAsset(restricted.revisionId);
    const internalAssetId = await attachAsset(internal.revisionId);
    const chatAssetId = await attachAsset(chat.revisionId);
    const draftAssetId = await attachAsset(draft.revisionId);

    // Store credential material the way a real operator would: in the shared
    // integration and (for the legacy column) on the target. The artifact must
    // not see any of it.
    await db.insert(schema.integrations).values({
      kind: 'github',
      authMode: 'ssh',
      secretEncrypted: encryptKey(CREDENTIALS.token),
      publicKey: CREDENTIALS.sshKey,
      label: 'leak-fixture',
    });
    await db.insert(schema.staticSiteTargets).values({
      isEnabled: true,
      remoteUrl: 'https://github.com/owner/site.git',
      branch: 'gh-pages',
      baseUrl: BASE_URL,
      authMode: 'ssh',
      secretEncrypted: encryptKey(CREDENTIALS.password),
    });

    const root = await stage();
    const manifest = await buildSnapshot({
      rootDir: root,
      baseUrl: BASE_URL,
      siteName: 'Leak Test Wiki',
      themeCss: '',
      skipSearchIndex: true,
    });

    // The eligible set is the two open-wiki, non-deleted pages; the rest must
    // be excluded. If the manifest reports more, the eligibility filter has
    // already broken before we even check the bytes.
    expect(manifest.pagesPublished).toBe(1);

    const files = await readArtifact(root);
    const everything = files.map((file) => file.text).join('\n');

    // Title, path, and any visible body content from each excluded page.
    const forbidden = [
      // restricted visibility
      'CLASSIFIED ROADMAP',
      'classified-roadmap',
      'Q3 launch details and PROJECT-GAMMA findings.',
      'PROJECT-GAMMA',
      // space disallows anonymous reading
      'INTERNAL HANDBOOK',
      'internal-handbook',
      'Hiring policy, on-call rotations.',
      // raw capture space
      'CHAT TRANSCRIPT',
      'chat-transcript',
      '[10:00] someone: do not publish this',
      // generated knowledge space
      'AI DRAFT',
      'ai-draft',
      'Unreviewed summary content.',
      // soft-deleted
      'VANISHED PAGE',
      'vanished',
      'A soft-deleted page that must not appear.',
      // assets used only by excluded pages (any form, including in their file
      // names under `_assets/` or in a leftover Markdown reference).
      restrictedAssetId,
      internalAssetId,
      chatAssetId,
      draftAssetId,
      // credential material stored on the integration or target.
      CREDENTIALS.token,
      CREDENTIALS.password,
      CREDENTIALS.sshKey,
      CREDENTIALS.apiKeySecret,
    ];

    for (const fragment of forbidden) {
      expect(everything, `"${fragment}" must not appear in the artifact`).not.toContain(fragment);
    }

    // Belt and braces: also check the file list itself for the excluded asset
    // ids, in case the leak would only be a directory entry.
    const fileNames = files.map((file) => file.path).join('\n');
    for (const assetId of [restrictedAssetId, internalAssetId, chatAssetId, draftAssetId]) {
      expect(fileNames, `asset path for ${assetId} must not exist in the artifact`).not.toContain(
        assetId,
      );
    }
  });
});
