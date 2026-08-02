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
  getTarget,
  listPublications,
  markStaleAndMaybePublish,
  publishNow,
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
    autoPublishOnChange: false,
    scheduledPublishEnabled: false,
    scheduledIntervalMinutes: 60,
    ...overrides,
  };
}

/** The credential lives in the shared integration, not on the target. */
async function connectGitHub() {
  await db.insert(schema.integrations).values({
    kind: 'github',
    authMode: 'ssh',
    secretEncrypted: encryptKey(TOKEN),
    publicKey: 'ssh-ed25519 AAAAC3Nz key',
  });
}

beforeEach(async () => {
  setBoss({ send: async () => randomUUID() } as unknown as PgBoss);
  await connectGitHub();
});

beforeAll(async () => {
  await db.delete(schema.staticSiteTargets);
  await db.delete(schema.integrations);
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
  // Publications cascade from the target; the integration outlives it.
  await db.delete(schema.staticSiteTargets);
  await db.delete(schema.integrations);
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

describe('deleteTarget', () => {
  it('removes the configuration but leaves the shared credential alone', async () => {
    // The credential belongs to the integration; other features may still be
    // using it.
    await configureTarget(adminCtx, upsert());
    await deleteTarget(adminCtx);
    expect(await findTarget()).toBeUndefined();
    expect(await db.query.integrations.findFirst()).toBeDefined();
  });
});

describe('enabling', () => {
  it('refuses to enable when GitHub is not connected', async () => {
    // The credential is shared, so enabling depends on the integration rather
    // than on anything stored against this target.
    await db.delete(schema.integrations);
    await expect(configureTarget(adminCtx, upsert({ isEnabled: true }))).rejects.toThrow(
      DomainError,
    );
    expect(await findTarget()).toBeUndefined();
  });

  it('enables when a credential is supplied, and queues an initial publish', async () => {
    const { view, queuedPublicationId } = await configureTarget(
      adminCtx,
      upsert({ isEnabled: true }),
    );
    expect(view.isEnabled).toBe(true);
    expect(queuedPublicationId).toBeTruthy();

    const runs = await listPublications(adminCtx);
    expect(runs).toHaveLength(1);
    expect(runs[0]!.status).toBe('queued');
    expect(runs[0]!.trigger).toBe('manual');
  });

  it('enables using a previously stored credential', async () => {
    await configureTarget(adminCtx, upsert({ }));
    const { view } = await configureTarget(adminCtx, upsert({ isEnabled: true }));
    expect(view.isEnabled).toBe(true);
  });

  it('does not queue anything when saved disabled', async () => {
    const { queuedPublicationId } = await configureTarget(adminCtx, upsert({ }));
    expect(queuedPublicationId).toBeNull();
    expect(await listPublications(adminCtx)).toHaveLength(0);
  });
});

describe('publishNow', () => {
  it('refuses when nothing is configured', async () => {
    await expect(publishNow(adminCtx)).rejects.toThrow(DomainError);
  });

  it('refuses when configured but disabled', async () => {
    await configureTarget(adminCtx, upsert({ }));
    await expect(publishNow(adminCtx)).rejects.toThrow(DomainError);
  });

  it('records a queued run for an enabled target', async () => {
    await configureTarget(adminCtx, upsert({ isEnabled: true }));
    const run = await publishNow(adminCtx);
    expect(run.status).toBe('queued');
    expect(run.pagesPublished).toBe(0);
  });

  it('allows a takedown even when publishing is disabled', async () => {
    // Otherwise an operator who disables publishing first would be unable to
    // remove the site that is still live.
    await configureTarget(adminCtx, upsert({ }));
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
    await configureTarget(adminCtx, upsert({ isEnabled: true }));
    const first = await listPublications(adminCtx);
    expect(first).toHaveLength(1);

    await markStaleAndMaybePublish();
    await markStaleAndMaybePublish();
    await markStaleAndMaybePublish();

    expect(await listPublications(adminCtx)).toHaveLength(1);
  });

  it('marks the site stale when a change lands during an active run', async () => {
    await configureTarget(adminCtx, upsert({ isEnabled: true }));
    await markStaleAndMaybePublish();
    expect((await findTarget())?.isStale).toBe(true);
  });

  it('does nothing at all when publishing is disabled', async () => {
    await configureTarget(adminCtx, upsert({ }));
    await markStaleAndMaybePublish();
    expect((await findTarget())?.isStale).toBe(false);
    expect(await listPublications(adminCtx)).toHaveLength(0);
  });
});

describe('scheduled publishing', () => {
  it('does nothing when scheduling is off', async () => {
    await configureTarget(adminCtx, upsert({ isEnabled: true }));
    expect(await tickScheduledPublish()).toBe(false);
  });

  it('skips while a run is already in flight', async () => {
    // Otherwise a slow publish would stack interval-triggered runs behind it.
    await configureTarget(
      adminCtx,
      upsert({ isEnabled: true, scheduledPublishEnabled: true }),
    );
    expect(await tickScheduledPublish()).toBe(false);
  });

  it('queues once the interval has elapsed since the last success', async () => {
    await configureTarget(
      adminCtx,
      upsert({ isEnabled: true, scheduledPublishEnabled: true, scheduledIntervalMinutes: 60 }),
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
    await configureTarget(adminCtx, upsert({ isEnabled: true }));
    await expect(takeDownSite(adminCtx, 'wrong')).rejects.toThrow(DomainError);
  });

  it('queues a takedown and switches publishing off', async () => {
    // Otherwise a scheduled or change trigger would put the site straight back.
    await configureTarget(adminCtx, upsert({ isEnabled: true }));
    const run = await takeDownSite(adminCtx, 'gh-pages');

    expect(run.trigger).toBe('takedown');
    expect((await findTarget())?.isEnabled).toBe(false);
  });

  it('cancels a pending publish so the site is not republished on the way out', async () => {
    await configureTarget(adminCtx, upsert({ isEnabled: true }));
    const before = await listPublications(adminCtx);
    expect(before[0]!.status).toBe('queued');

    await takeDownSite(adminCtx, 'gh-pages');
    const after = await listPublications(adminCtx);
    const superseded = after.find((run) => run.id === before[0]!.id);
    expect(superseded?.status).toBe('cancelled');
  });

  it('denies a non-admin', async () => {
    await configureTarget(adminCtx, upsert({ isEnabled: true }));
    await expect(takeDownSite(editorCtx, 'gh-pages')).rejects.toThrow(DomainError);
  });
});

