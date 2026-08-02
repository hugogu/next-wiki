import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PgBoss } from 'pg-boss';
import { eq } from 'drizzle-orm';
import { db, closeDb } from '@/server/db';
import * as schema from '@/server/db/schema';
import { setBoss } from '@/server/jobs/runtime';
import { buildApiKeyCtx, buildAnonymousCtx, buildUserCtx, type PermCtx } from '@/server/permissions';
import { DomainError } from '@/server/errors';
import { encryptKey } from '@/server/crypto/key-encryption';
import {
  configureTarget,
  deleteTarget,
  findTarget,
  getKeyReuseOffer,
  getTarget,
  listPublications,
  markStaleAndMaybePublish,
  publishNow,
  reuseGitExportKey,
  takeDownSite,
  tickScheduledPublish,
} from './static-site';

let adminCtx: PermCtx;
let editorCtx: PermCtx;
let adminKeyCtx: PermCtx;

const TOKEN = 'ghp_super_secret_token_value';

function upsert(overrides: Record<string, unknown> = {}) {
  return {
    isEnabled: false,
    remoteUrl: 'https://github.com/owner/site.git',
    branch: 'gh-pages',
    baseUrl: 'https://owner.github.io/site/',
    authMode: 'https_token' as const,
    autoPublishOnChange: false,
    scheduledPublishEnabled: false,
    scheduledIntervalMinutes: 60,
    ...overrides,
  };
}

beforeEach(() => {
  setBoss({ send: async () => randomUUID() } as unknown as PgBoss);
});

beforeAll(async () => {
  await db.delete(schema.staticSiteTargets);
  await db.delete(schema.users);
  const [admin] = await db
    .insert(schema.users)
    .values({ email: 'ss-admin@example.com', passwordHash: 'HASH', role: 'admin' })
    .returning();
  const [editor] = await db
    .insert(schema.users)
    .values({ email: 'ss-editor@example.com', passwordHash: 'HASH', role: 'editor' })
    .returning();
  adminCtx = buildUserCtx(admin!.id, 'admin');
  editorCtx = buildUserCtx(editor!.id, 'editor');
  // An admin-owned key carrying every scope it could possibly be granted.
  adminKeyCtx = buildApiKeyCtx(admin!.id, 'admin', ['storage', 'transfers', 'view'], randomUUID());
});

afterEach(async () => {
  setBoss(null);
  // Publications cascade from the target.
  await db.delete(schema.staticSiteTargets);
});

afterAll(async () => {
  await db.delete(schema.users);
  await closeDb();
});

describe('permissions', () => {
  it('denies editors', async () => {
    await expect(getTarget(editorCtx)).rejects.toThrow(DomainError);
    await expect(configureTarget(editorCtx, upsert())).rejects.toThrow(DomainError);
  });

  it('denies anonymous actors', async () => {
    await expect(getTarget(buildAnonymousCtx())).rejects.toThrow(DomainError);
  });

  it('denies API keys even when owned by an admin with broad scopes', async () => {
    // Publishing exposes wiki content at a public address under the
    // deployment's name. A key issued for storage or transfers must never be
    // able to do that, which is why this has its own permission action rather
    // than riding on manage_storage.
    await expect(getTarget(adminKeyCtx)).rejects.toThrow(DomainError);
    await expect(configureTarget(adminKeyCtx, upsert())).rejects.toThrow(DomainError);
  });

  it('does not disclose configuration in the denial', async () => {
    await configureTarget(adminCtx, upsert({ remoteUrl: 'https://github.com/secret/repo.git' }));
    const error = await getTarget(editorCtx).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(DomainError);
    expect(JSON.stringify(error)).not.toContain('secret/repo');
  });
});

describe('credential handling', () => {
  it('never returns the secret in any view', async () => {
    const { view } = await configureTarget(adminCtx, upsert({ secret: TOKEN }));
    expect(JSON.stringify(view)).not.toContain(TOKEN);
    expect(view.hasSecret).toBe(true);

    const fetched = await getTarget(adminCtx);
    expect(JSON.stringify(fetched)).not.toContain(TOKEN);
    expect(fetched?.hasSecret).toBe(true);
  });

  it('stores the secret encrypted rather than in plaintext', async () => {
    await configureTarget(adminCtx, upsert({ secret: TOKEN }));
    const row = await findTarget();
    expect(row?.secretEncrypted).toBeTruthy();
    expect(row?.secretEncrypted).not.toContain(TOKEN);
  });

  it('keeps the stored secret when an update omits it', async () => {
    await configureTarget(adminCtx, upsert({ secret: TOKEN }));
    const before = (await findTarget())?.secretEncrypted;
    await configureTarget(adminCtx, upsert({ branch: 'pages' }));
    expect((await findTarget())?.secretEncrypted).toBe(before);
  });

  it('drops a stored credential that no longer matches the auth mode', async () => {
    // An HTTPS token cannot authenticate an SSH remote. Keeping it would fail
    // confusingly at push time instead of at configuration time.
    await configureTarget(adminCtx, upsert({ secret: TOKEN }));
    await configureTarget(adminCtx, upsert({ authMode: 'ssh' }));
    const row = await findTarget();
    expect(row?.secretEncrypted).toBeNull();
    expect(row?.isEnabled).toBe(false);
  });

  it('destroys the credential when the target is removed', async () => {
    await configureTarget(adminCtx, upsert({ secret: TOKEN }));
    await deleteTarget(adminCtx);
    expect(await findTarget()).toBeUndefined();
  });
});

describe('enabling', () => {
  it('refuses to enable without a credential', async () => {
    await expect(configureTarget(adminCtx, upsert({ isEnabled: true }))).rejects.toThrow(
      DomainError,
    );
    expect(await findTarget()).toBeUndefined();
  });

  it('enables when a credential is supplied, and queues an initial publish', async () => {
    const { view, queuedPublicationId } = await configureTarget(
      adminCtx,
      upsert({ isEnabled: true, secret: TOKEN }),
    );
    expect(view.isEnabled).toBe(true);
    expect(queuedPublicationId).toBeTruthy();

    const runs = await listPublications(adminCtx);
    expect(runs).toHaveLength(1);
    expect(runs[0]!.status).toBe('queued');
    expect(runs[0]!.trigger).toBe('manual');
  });

  it('enables using a previously stored credential', async () => {
    await configureTarget(adminCtx, upsert({ secret: TOKEN }));
    const { view } = await configureTarget(adminCtx, upsert({ isEnabled: true }));
    expect(view.isEnabled).toBe(true);
  });

  it('does not queue anything when saved disabled', async () => {
    const { queuedPublicationId } = await configureTarget(adminCtx, upsert({ secret: TOKEN }));
    expect(queuedPublicationId).toBeNull();
    expect(await listPublications(adminCtx)).toHaveLength(0);
  });
});

describe('publishNow', () => {
  it('refuses when nothing is configured', async () => {
    await expect(publishNow(adminCtx)).rejects.toThrow(DomainError);
  });

  it('refuses when configured but disabled', async () => {
    await configureTarget(adminCtx, upsert({ secret: TOKEN }));
    await expect(publishNow(adminCtx)).rejects.toThrow(DomainError);
  });

  it('records a queued run for an enabled target', async () => {
    await configureTarget(adminCtx, upsert({ isEnabled: true, secret: TOKEN }));
    const run = await publishNow(adminCtx);
    expect(run.status).toBe('queued');
    expect(run.pagesPublished).toBe(0);
  });

  it('allows a takedown even when publishing is disabled', async () => {
    // Otherwise an operator who disables publishing first would be unable to
    // remove the site that is still live.
    await configureTarget(adminCtx, upsert({ secret: TOKEN }));
    const run = await publishNow(adminCtx, 'takedown');
    expect(run.trigger).toBe('takedown');
  });
});

describe('base URL validation', () => {
  it.each([
    ['not-a-url'],
    ['ftp://example.com/'],
    [''],
  ])('rejects %s', async (baseUrl) => {
    await expect(configureTarget(adminCtx, upsert({ baseUrl }))).rejects.toThrow();
  });

  it('accepts a project sub-path address', async () => {
    const { view } = await configureTarget(
      adminCtx,
      upsert({ baseUrl: 'https://owner.github.io/site/' }),
    );
    expect(view.baseUrl).toBe('https://owner.github.io/site/');
  });
});

describe('remote validation', () => {
  it('rejects a remote with embedded credentials', async () => {
    await expect(
      configureTarget(adminCtx, upsert({ remoteUrl: 'https://user:pass@github.com/o/r.git' })),
    ).rejects.toThrow();
  });
});

describe('trigger collapsing', () => {
  it('reuses an in-flight run instead of stacking rows the queue would strand', async () => {
    // Every trigger creating its own row would leave a trail that can never
    // run: the queue's singleton slot merges the jobs behind them.
    await configureTarget(adminCtx, upsert({ isEnabled: true, secret: TOKEN }));
    const first = await listPublications(adminCtx);
    expect(first).toHaveLength(1);

    await markStaleAndMaybePublish();
    await markStaleAndMaybePublish();
    await markStaleAndMaybePublish();

    expect(await listPublications(adminCtx)).toHaveLength(1);
  });

  it('marks the site stale when a change lands during an active run', async () => {
    await configureTarget(adminCtx, upsert({ isEnabled: true, secret: TOKEN }));
    await markStaleAndMaybePublish();
    expect((await findTarget())?.isStale).toBe(true);
  });

  it('does nothing at all when publishing is disabled', async () => {
    await configureTarget(adminCtx, upsert({ secret: TOKEN }));
    await markStaleAndMaybePublish();
    expect((await findTarget())?.isStale).toBe(false);
    expect(await listPublications(adminCtx)).toHaveLength(0);
  });
});

describe('scheduled publishing', () => {
  it('does nothing when scheduling is off', async () => {
    await configureTarget(adminCtx, upsert({ isEnabled: true, secret: TOKEN }));
    expect(await tickScheduledPublish()).toBe(false);
  });

  it('skips while a run is already in flight', async () => {
    // Otherwise a slow publish would stack interval-triggered runs behind it.
    await configureTarget(
      adminCtx,
      upsert({ isEnabled: true, secret: TOKEN, scheduledPublishEnabled: true }),
    );
    expect(await tickScheduledPublish()).toBe(false);
  });

  it('queues once the interval has elapsed since the last success', async () => {
    await configureTarget(
      adminCtx,
      upsert({ isEnabled: true, secret: TOKEN, scheduledPublishEnabled: true, scheduledIntervalMinutes: 60 }),
    );
    const target = await findTarget();
    await db
      .update(schema.staticSitePublications)
      .set({ status: 'succeeded', completedAt: new Date('2026-01-01T00:00:00Z') })
      .where(eq(schema.staticSitePublications.targetId, target!.id));

    expect(await tickScheduledPublish(new Date('2026-01-01T00:30:00Z'))).toBe(false);
    expect(await tickScheduledPublish(new Date('2026-01-01T01:30:00Z'))).toBe(true);
  });
});

describe('takedown', () => {
  it('requires the branch name as confirmation', async () => {
    await configureTarget(adminCtx, upsert({ isEnabled: true, secret: TOKEN }));
    await expect(takeDownSite(adminCtx, 'wrong')).rejects.toThrow(DomainError);
  });

  it('queues a takedown and switches publishing off', async () => {
    // Otherwise a scheduled or change trigger would put the site straight back.
    await configureTarget(adminCtx, upsert({ isEnabled: true, secret: TOKEN }));
    const run = await takeDownSite(adminCtx, 'gh-pages');

    expect(run.trigger).toBe('takedown');
    expect((await findTarget())?.isEnabled).toBe(false);
  });

  it('cancels a pending publish so the site is not republished on the way out', async () => {
    await configureTarget(adminCtx, upsert({ isEnabled: true, secret: TOKEN }));
    const before = await listPublications(adminCtx);
    expect(before[0]!.status).toBe('queued');

    await takeDownSite(adminCtx, 'gh-pages');
    const after = await listPublications(adminCtx);
    const superseded = after.find((run) => run.id === before[0]!.id);
    expect(superseded?.status).toBe('cancelled');
  });

  it('denies a non-admin', async () => {
    await configureTarget(adminCtx, upsert({ isEnabled: true, secret: TOKEN }));
    await expect(takeDownSite(editorCtx, 'gh-pages')).rejects.toThrow(DomainError);
  });
});

describe('deploy key reuse', () => {
  async function seedGitExportKey(remoteUrl: string) {
    await db.insert(schema.storageBackends).values({
      type: 'git',
      purpose: 'git_export',
      isActive: true,
      replicaState: 'enabled',
      config: {
        remoteUrl,
        branch: 'main',
        assetsDir: 'assets',
        authMode: 'ssh',
        publicKey: 'ssh-ed25519 AAAAC3Nz shared-key',
        fingerprint: 'SHA256:abc',
        autoSyncOnPublish: true,
        scheduledSyncEnabled: false,
        scheduledSyncIntervalMinutes: 60,
      },
      secretEncrypted: encryptKey('PRIVATE_KEY_MATERIAL'),
    });
  }

  afterEach(async () => {
    await db.delete(schema.storageBackends);
  });

  it('offers reuse when both features target the same repository', async () => {
    // A deploy key can only be registered on one repository, so reuse is
    // exactly as useful as the two targets being the same repository.
    await seedGitExportKey('git@github.com:owner/wiki.git');
    const offer = await getKeyReuseOffer(adminCtx, 'https://github.com/owner/wiki.git');
    expect(offer.available).toBe(true);
  });

  it('declines when the repositories differ, because the host would reject the key', async () => {
    await seedGitExportKey('git@github.com:owner/backup.git');
    const offer = await getKeyReuseOffer(adminCtx, 'git@github.com:owner/site.git');
    expect(offer).toEqual({ available: false, reason: 'different_repository' });
  });

  it('declines when Git export uses a token rather than a key', async () => {
    const offer = await getKeyReuseOffer(adminCtx, 'git@github.com:owner/wiki.git');
    expect(offer).toEqual({ available: false, reason: 'no_git_export_key' });
  });

  it('copies the key rather than referencing it, so the features stay independent', async () => {
    await seedGitExportKey('git@github.com:owner/wiki.git');
    await configureTarget(
      adminCtx,
      upsert({ remoteUrl: 'https://github.com/owner/wiki.git', authMode: 'ssh' }),
    );

    const result = await reuseGitExportKey(adminCtx);
    expect(result.publicKey).toContain('shared-key');

    const target = await findTarget();
    expect(target?.authMode).toBe('ssh');
    expect(target?.secretEncrypted).toBeTruthy();

    // Removing Git export afterwards must not affect publishing.
    await db.delete(schema.storageBackends);
    expect((await findTarget())?.secretEncrypted).toBeTruthy();
  });

  it('refuses to copy a key from a different repository', async () => {
    await seedGitExportKey('git@github.com:owner/backup.git');
    await configureTarget(
      adminCtx,
      upsert({ remoteUrl: 'git@github.com:owner/site.git', authMode: 'ssh' }),
    );
    await expect(reuseGitExportKey(adminCtx)).rejects.toThrow(DomainError);
  });

  it('denies a non-admin', async () => {
    await seedGitExportKey('git@github.com:owner/wiki.git');
    await expect(getKeyReuseOffer(editorCtx, 'git@github.com:owner/wiki.git')).rejects.toThrow(
      DomainError,
    );
  });
});
