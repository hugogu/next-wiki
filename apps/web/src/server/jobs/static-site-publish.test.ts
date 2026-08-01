import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db, closeDb } from '@/server/db';
import * as schema from '@/server/db/schema';
import { encryptKey } from '@/server/crypto/key-encryption';
import { redactCredentials, runStaticSitePublish } from './static-site-publish';

/**
 * Failure paths only. Every case here must leave the previously published site
 * untouched (FR-031), which is why they all fail before the delivery step —
 * nothing reaches a git remote in this suite.
 */

const TOKEN = 'ghp_super_secret_token_value';
let authorId: string;

async function makeTarget(overrides: Record<string, unknown> = {}) {
  const [target] = await db
    .insert(schema.staticSiteTargets)
    .values({
      isEnabled: true,
      // Unroutable on purpose: delivery must fail fast without reaching the
      // network, so this suite never depends on an external host.
      remoteUrl: 'https://127.0.0.1:1/owner/site.git',
      branch: 'gh-pages',
      baseUrl: 'https://owner.github.io/site/',
      authMode: 'https_token',
      secretEncrypted: encryptKey(TOKEN),
      ...overrides,
    })
    .returning();
  return target!;
}

async function makeRun(targetId: string, trigger: 'manual' | 'takedown' = 'manual') {
  const [run] = await db
    .insert(schema.staticSitePublications)
    .values({ targetId, trigger, status: 'queued' })
    .returning();
  return run!;
}

async function readRun(id: string) {
  return db.query.staticSitePublications.findFirst({
    where: eq(schema.staticSitePublications.id, id),
  });
}

async function makePublishablePage() {
  const [space] = await db
    .insert(schema.spaces)
    .values({ slug: 'wiki-pub', name: 'wiki', kind: 'wiki', anonymousRead: true })
    .returning();
  const [page] = await db
    .insert(schema.pages)
    .values({
      spaceId: space!.id,
      slug: 'a',
      path: 'a',
      locale: 'en',
      title: 'A',
      authorId,
      visibility: 'public',
    })
    .returning();
  const [revision] = await db
    .insert(schema.pageRevisions)
    .values({
      pageId: page!.id,
      versionNumber: 1,
      contentSource: '# A',
      contentHtml: '<h1>A</h1>',
      contentHash: createHash('sha256').update('# A').digest('hex'),
      status: 'published',
      publishedAt: new Date(),
      authorId,
    })
    .returning();
  await db
    .update(schema.pages)
    .set({ latestVersionId: revision!.id, currentPublishedVersionId: revision!.id })
    .where(eq(schema.pages.id, page!.id));
}

async function clearAll() {
  await db.update(schema.pages).set({ currentPublishedVersionId: null, latestVersionId: null });
  await db.delete(schema.pageRevisions);
  await db.delete(schema.pages);
  await db.delete(schema.spaces);
  await db.delete(schema.staticSiteTargets);
}

beforeAll(async () => {
  await clearAll();
  await db.delete(schema.users);
  const [author] = await db
    .insert(schema.users)
    .values({ email: 'job@example.com', passwordHash: 'HASH', role: 'admin' })
    .returning();
  authorId = author!.id;
});

afterEach(clearAll);

afterAll(async () => {
  await db.delete(schema.users);
  await closeDb();
});

describe('redactCredentials', () => {
  it('removes the configured secret wherever it appears', () => {
    expect(redactCredentials(`fatal: auth failed for ${TOKEN}`, TOKEN)).not.toContain(TOKEN);
  });

  it('removes URL userinfo even when it is not the stored secret', () => {
    // A misconfigured remote can carry a credential the job never stored.
    const message = redactCredentials('fatal: https://someone:hunter2@github.com/o/r.git', null);
    expect(message).not.toContain('hunter2');
    expect(message).toContain('[redacted]@');
  });

  it('leaves an ordinary message alone', () => {
    expect(redactCredentials('fatal: repository not found', TOKEN)).toBe(
      'fatal: repository not found',
    );
  });

  it('ignores a short secret rather than redacting common substrings', () => {
    expect(redactCredentials('a short message', 'abc')).toBe('a short message');
  });
});

describe('run guards', () => {
  it('fails rather than publishing an empty site over a live one', async () => {
    // No publishable page exists. Delivering would replace the branch with
    // nothing, which is a takedown — a different, explicitly confirmed action.
    const target = await makeTarget();
    const run = await makeRun(target.id);

    await expect(runStaticSitePublish(target.id, run.id)).rejects.toThrow();

    const stored = await readRun(run.id);
    expect(stored?.status).toBe('failed');
    expect(stored?.errorMessage).toContain('takedown');
    expect(stored?.pagesPublished).toBe(0);
  });

  it('cancels a run whose target was disabled before it started', async () => {
    await makePublishablePage();
    const target = await makeTarget({ isEnabled: false });
    const run = await makeRun(target.id);

    await runStaticSitePublish(target.id, run.id);

    const stored = await readRun(run.id);
    expect(stored?.status).toBe('cancelled');
    expect(stored?.errorMessage).toContain('disabled');
  });

  it('cancels a run whose target was removed before it started', async () => {
    const target = await makeTarget();
    const run = await makeRun(target.id);
    // Detach the run so the target can go away without cascading it.
    await db.delete(schema.staticSiteTargets).where(eq(schema.staticSiteTargets.id, target.id));

    // The cascade removes the run too, so there is nothing left to update; the
    // job must simply not throw.
    await expect(runStaticSitePublish(target.id, run.id)).resolves.toBeUndefined();
  });

  it('fails with a clear reason when no credential is configured', async () => {
    await makePublishablePage();
    const target = await makeTarget({ secretEncrypted: null });
    const run = await makeRun(target.id);

    await runStaticSitePublish(target.id, run.id);

    const stored = await readRun(run.id);
    expect(stored?.status).toBe('failed');
    expect(stored?.errorMessage).toContain('credential');
  });

  it('never stores the credential in a failure message', async () => {
    const target = await makeTarget();
    const run = await makeRun(target.id);
    await runStaticSitePublish(target.id, run.id).catch(() => undefined);

    const stored = await readRun(run.id);
    expect(stored?.errorMessage ?? '').not.toContain(TOKEN);
  });

  it('allows a takedown run even when publishing is disabled', async () => {
    // Otherwise an operator who disables publishing first could never remove
    // the site that is still live.
    const target = await makeTarget({ isEnabled: false });
    const run = await makeRun(target.id, 'takedown');

    // Delivery will fail against a remote that does not exist, but the run must
    // get past the disabled check to reach it.
    await runStaticSitePublish(target.id, run.id).catch(() => undefined);

    const stored = await readRun(run.id);
    expect(stored?.status).not.toBe('cancelled');
  });
});
