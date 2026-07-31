import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PgBoss } from 'pg-boss';
import { db, closeDb } from '@/server/db';
import * as schema from '@/server/db/schema';
import { setBoss } from '@/server/jobs/runtime';
import { buildApiKeyCtx, buildAnonymousCtx, buildUserCtx, type PermCtx } from '@/server/permissions';
import { DomainError } from '@/server/errors';
import {
  configureTarget,
  deleteTarget,
  findTarget,
  getTarget,
  listPublications,
  publishNow,
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
