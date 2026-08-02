import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PgBoss } from 'pg-boss';
import { eq } from 'drizzle-orm';
import { db, closeDb } from '@/server/db';
import * as schema from '@/server/db/schema';
import { setBoss } from '@/server/jobs/runtime';
import { encryptKey } from '@/server/crypto/key-encryption';
import { notifyPublicContentChanged } from './public-content-events';
import { findTarget } from './static-site';

/**
 * FR-002 and US6 scenario 5: Git export and static site publishing react to the
 * same content change without touching each other's target, state, or artifact.
 *
 * These are the assertions that would fail if the two features ever grew a
 * shared row, a shared queue, or a shared enable switch.
 */

async function seedGitExport(isActive = true) {
  await db.insert(schema.storageBackends).values({
    type: 'git',
    purpose: 'git_export',
    isActive,
    replicaState: isActive ? 'enabled' : 'disabled',
    config: {
      remoteUrl: 'git@github.com:owner/backup.git',
      branch: 'main',
      assetsDir: 'assets',
      authMode: 'ssh',
      autoSyncOnPublish: true,
      scheduledSyncEnabled: false,
      scheduledSyncIntervalMinutes: 60,
    },
    secretEncrypted: encryptKey('PRIVATE_KEY'),
  });
}

async function seedStaticSite(isEnabled = true, autoPublishOnChange = true) {
  await db.insert(schema.integrations).values({
    kind: 'github',
    authMode: 'ssh',
    secretEncrypted: encryptKey('PRIVATE_KEY'),
  }).onConflictDoNothing();
  await db.insert(schema.staticSiteTargets).values({
    isEnabled,
    remoteUrl: 'https://github.com/owner/site.git',
    branch: 'gh-pages',
    baseUrl: 'https://owner.github.io/site/',
    autoPublishOnChange,
  });
}

const sent: string[] = [];

beforeEach(() => {
  sent.length = 0;
  setBoss({
    send: async (queue: string) => {
      sent.push(queue);
      return randomUUID();
    },
  } as unknown as PgBoss);
});

beforeAll(async () => {
  await db.delete(schema.staticSiteTargets);
  await db.delete(schema.integrations);
  await db.delete(schema.storageBackends);
});

afterEach(async () => {
  setBoss(null);
  await db.delete(schema.staticSiteTargets);
  await db.delete(schema.integrations);
  await db.delete(schema.storageBackends);
});

afterAll(async () => {
  await closeDb();
});

describe('notifyPublicContentChanged', () => {
  it('reaches both features from one event', async () => {
    await seedGitExport();
    await seedStaticSite();

    await notifyPublicContentChanged('publish');

    expect(sent).toContain('git-export');
    expect(sent).toContain('static-site-publish');
  });

  it('drives Git export when static site publishing is not configured', async () => {
    await seedGitExport();
    await notifyPublicContentChanged('publish');
    expect(sent).toContain('git-export');
    expect(sent).not.toContain('static-site-publish');
  });

  it('drives static site publishing when Git export is not configured', async () => {
    await seedStaticSite();
    await notifyPublicContentChanged('publish');
    expect(sent).toContain('static-site-publish');
    expect(sent).not.toContain('git-export');
  });

  it('leaves the static site target untouched when only Git export is enabled', async () => {
    await seedGitExport();
    await seedStaticSite(false, false);

    await notifyPublicContentChanged('publish');

    // Disabled publishing must not be marked stale or queued by the other
    // feature's activity.
    const target = await findTarget();
    expect(target?.isStale).toBe(false);
    expect(sent).not.toContain('static-site-publish');
  });

  it('leaves Git export untouched when only static site publishing is enabled', async () => {
    await seedGitExport(false);
    await seedStaticSite();

    await notifyPublicContentChanged('publish');

    const backend = await db.query.storageBackends.findFirst({
      where: eq(schema.storageBackends.purpose, 'git_export'),
    });
    expect(backend?.isActive).toBe(false);
    expect(backend?.replicaState).toBe('disabled');
    expect(sent).not.toContain('git-export');
  });

  it('honors each feature own change-trigger setting independently', async () => {
    // Git export syncs on publish; static site publishing is set not to.
    await seedGitExport();
    await seedStaticSite(true, false);

    await notifyPublicContentChanged('publish');

    expect(sent).toContain('git-export');
    expect(sent).not.toContain('static-site-publish');
    // Still recorded as out of date, so a manual publish is clearly warranted.
    expect((await findTarget())?.isStale).toBe(true);
  });

  it('does nothing when neither feature is configured', async () => {
    await notifyPublicContentChanged('publish');
    expect(sent).toEqual([]);
  });
});
