import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PgBoss } from 'pg-boss';
import { db, closeDb } from '@/server/db';
import * as schema from '@/server/db/schema';
import { setBoss } from '@/server/jobs/runtime';
import { buildUserCtx, type PermCtx } from '@/server/permissions';
import { enqueueGitExport, runGitExportNow, tickScheduledGitExport } from './git-export';

type GitConfigOverrides = Partial<{
  autoSyncOnPublish: boolean;
  scheduledSyncEnabled: boolean;
  scheduledSyncIntervalMinutes: number;
}>;

let adminCtx: PermCtx;
let editorCtx: PermCtx;

async function seedGitBackend(options: {
  isActive?: boolean;
  replicaState?: 'enabled' | 'backfilling';
  lastSyncAt?: Date | null;
  config?: GitConfigOverrides;
} = {}): Promise<void> {
  await db.insert(schema.storageBackends).values({
    type: 'git',
    purpose: 'git_export',
    isActive: options.isActive ?? true,
    replicaState: options.replicaState ?? 'enabled',
    lastSyncAt: options.lastSyncAt ?? null,
    config: {
      remoteUrl: 'git@github.com:owner/repository.git',
      branch: 'main',
      assetsDir: 'assets',
      authMode: 'ssh',
      autoSyncOnPublish: true,
      scheduledSyncEnabled: false,
      scheduledSyncIntervalMinutes: 60,
      ...options.config,
    },
    secretEncrypted: 'ENCRYPTED',
  });
}

// A boss stub whose send() reports success so enqueue() returns a job id; this
// lets assertions distinguish "gated" (no enqueue) from "queued".
beforeEach(() => {
  setBoss({ send: async () => randomUUID() } as unknown as PgBoss);
});

beforeAll(async () => {
  await db.delete(schema.storageBackends);
  await db.delete(schema.users);
  const [admin] = await db
    .insert(schema.users)
    .values({ email: 'ge-admin@example.com', passwordHash: 'HASH', role: 'admin' })
    .returning();
  const [editor] = await db
    .insert(schema.users)
    .values({ email: 'ge-editor@example.com', passwordHash: 'HASH', role: 'editor' })
    .returning();
  adminCtx = buildUserCtx(admin!.id, 'admin');
  editorCtx = buildUserCtx(editor!.id, 'editor');
});

afterEach(async () => {
  setBoss(null);
  await db.delete(schema.storageBackends);
});

afterAll(async () => {
  await db.delete(schema.users);
  await closeDb();
});

describe('enqueueGitExport publish gating', () => {
  it('skips the publish trigger when auto-sync on publish is disabled', async () => {
    await seedGitBackend({ config: { autoSyncOnPublish: false } });
    expect(await enqueueGitExport('publish')).toBe(false);
  });

  it('queues the publish trigger when auto-sync on publish is enabled', async () => {
    await seedGitBackend({ config: { autoSyncOnPublish: true } });
    expect(await enqueueGitExport('publish')).toBe(true);
  });

  it('always queues manual triggers regardless of the publish toggle', async () => {
    await seedGitBackend({ config: { autoSyncOnPublish: false } });
    expect(await enqueueGitExport('manual')).toBe(true);
  });

  it('does nothing when the backend is inactive', async () => {
    await seedGitBackend({ isActive: false });
    expect(await enqueueGitExport('manual')).toBe(false);
  });
});

describe('tickScheduledGitExport', () => {
  it('does nothing when scheduled sync is disabled', async () => {
    await seedGitBackend({ config: { scheduledSyncEnabled: false } });
    expect(await tickScheduledGitExport()).toBe(false);
  });

  it('skips when the interval has not yet elapsed', async () => {
    const now = new Date('2026-06-20T12:00:00Z');
    await seedGitBackend({
      lastSyncAt: new Date('2026-06-20T11:30:00Z'),
      config: { scheduledSyncEnabled: true, scheduledSyncIntervalMinutes: 60 },
    });
    expect(await tickScheduledGitExport(now)).toBe(false);
  });

  it('queues when the interval has elapsed since the last sync', async () => {
    const now = new Date('2026-06-20T12:00:00Z');
    await seedGitBackend({
      lastSyncAt: new Date('2026-06-20T10:30:00Z'),
      config: { scheduledSyncEnabled: true, scheduledSyncIntervalMinutes: 60 },
    });
    expect(await tickScheduledGitExport(now)).toBe(true);
  });

  it('queues the first run when there is no prior sync timestamp', async () => {
    await seedGitBackend({
      lastSyncAt: null,
      config: { scheduledSyncEnabled: true, scheduledSyncIntervalMinutes: 60 },
    });
    expect(await tickScheduledGitExport()).toBe(true);
  });

  it('skips while a backfill is already running', async () => {
    await seedGitBackend({
      replicaState: 'backfilling',
      lastSyncAt: null,
      config: { scheduledSyncEnabled: true },
    });
    expect(await tickScheduledGitExport()).toBe(false);
  });
});

describe('runGitExportNow', () => {
  it('queues a manual run for admins', async () => {
    await seedGitBackend();
    const result = await runGitExportNow(adminCtx);
    expect(result.queued).toBe(true);
  });

  it('rejects non-admin callers', async () => {
    await seedGitBackend();
    await expect(runGitExportNow(editorCtx)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('rejects when the backend is inactive', async () => {
    await seedGitBackend({ isActive: false });
    await expect(runGitExportNow(adminCtx)).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('throws when the job queue cannot enqueue', async () => {
    setBoss(null);
    await seedGitBackend();
    await expect(runGitExportNow(adminCtx)).rejects.toMatchObject({ code: 'STORAGE_UNAVAILABLE' });
  });
});
