import { beforeAll, afterAll, beforeEach, describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { s3BackendConfigSchema, gitBackendConfigSchema } from '@next-wiki/shared';
import { db, closeDb } from '@/server/db';
import * as schema from '@/server/db/schema';
import { buildUserCtx, buildAnonymousCtx, type PermCtx } from '@/server/permissions';
import { decryptKey } from '@/server/crypto/key-encryption';
import { seedDefaultStorageBackend } from '@/server/seed';
import * as storageConfig from '@/server/services/storage-config';
import { withTempDir } from '../../../test/content-storage-fixtures';

let adminCtx: PermCtx;
let editorCtx: PermCtx;

async function cleanup() {
  await db.delete(schema.contentMigrations);
  await db.delete(schema.storageBackends);
  await db.delete(schema.users);
}

beforeAll(async () => {
  await cleanup();
  const [admin] = await db
    .insert(schema.users)
    .values({ email: 'sc-admin@example.com', passwordHash: 'HASH', role: 'admin' })
    .returning();
  const [editor] = await db
    .insert(schema.users)
    .values({ email: 'sc-editor@example.com', passwordHash: 'HASH', role: 'editor' })
    .returning();
  adminCtx = buildUserCtx(admin!.id, 'admin');
  editorCtx = buildUserCtx(editor!.id, 'editor');
});

afterAll(async () => {
  await cleanup();
  await closeDb();
});

beforeEach(async () => {
  await db.delete(schema.contentMigrations);
  await db.delete(schema.storageBackends);
  await seedDefaultStorageBackend();
});

describe('admin-only access', () => {
  it('hides the overview from non-admins and rejects mutations', async () => {
    expect(await storageConfig.getOverview(editorCtx)).toBeNull();
    expect(await storageConfig.getOverview(buildAnonymousCtx())).toBeNull();
    await expect(
      storageConfig.upsertBackend(editorCtx, { type: 'local', config: { basePath: '/tmp/x' } }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(
      storageConfig.checkBackend(editorCtx, { type: 'local', config: { basePath: '/tmp/x' } }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});

describe('overview', () => {
  it('reports the active Database backend', async () => {
    const overview = await storageConfig.getOverview(adminCtx);
    expect(overview?.active.type).toBe('database');
    expect(overview?.active.isActive).toBe(true);
    expect(overview?.migration).toBeNull();
  });
});

describe('upsert and secret handling', () => {
  it('stores a local backend without a secret and returns masked config', async () => {
    const view = await storageConfig.upsertBackend(adminCtx, {
      type: 'local',
      config: { basePath: '/data/content' },
    });
    expect(view.type).toBe('local');
    expect(view.isActive).toBe(false);
    expect(view.hasSecret).toBe(false);
    expect(view.config).toMatchObject({ basePath: '/data/content' });
  });

  it('encrypts the S3 secret, never echoes it, and rotates on update', async () => {
    const created = await storageConfig.upsertBackend(adminCtx, {
      type: 's3',
      config: { region: 'us-east-1', bucket: 'b', accessKeyId: 'AK' },
      secret: 'super-secret-1',
    });
    expect(created.hasSecret).toBe(true);
    expect(JSON.stringify(created)).not.toContain('super-secret-1');

    const row1 = await db.query.storageBackends.findFirst({
      where: eq(schema.storageBackends.id, created.id),
    });
    expect(row1!.secretEncrypted).not.toContain('super-secret-1');
    expect(decryptKey(row1!.secretEncrypted!)).toBe('super-secret-1');

    // Update without a secret keeps the existing one.
    await storageConfig.upsertBackend(adminCtx, {
      type: 's3',
      config: { region: 'us-east-1', bucket: 'b2', accessKeyId: 'AK' },
    });
    const row2 = await db.query.storageBackends.findFirst({
      where: eq(schema.storageBackends.id, created.id),
    });
    expect(decryptKey(row2!.secretEncrypted!)).toBe('super-secret-1');
    expect((row2!.config as { bucket: string }).bucket).toBe('b2');

    // Rotate the secret.
    await storageConfig.upsertBackend(adminCtx, {
      type: 's3',
      config: { region: 'us-east-1', bucket: 'b2', accessKeyId: 'AK' },
      secret: 'super-secret-2',
    });
    const row3 = await db.query.storageBackends.findFirst({
      where: eq(schema.storageBackends.id, created.id),
    });
    expect(decryptKey(row3!.secretEncrypted!)).toBe('super-secret-2');
  });
});

describe('config validation rejects URL-embedded credentials', () => {
  it('rejects an S3 endpoint and Git remote that embed credentials', () => {
    expect(
      s3BackendConfigSchema.safeParse({
        endpoint: 'https://user:pass@s3.example.com',
        region: 'us-east-1',
        bucket: 'b',
        accessKeyId: 'AK',
      }).success,
    ).toBe(false);
    expect(
      gitBackendConfigSchema.safeParse({
        remoteUrl: 'https://user:token@github.com/o/r.git',
        branch: 'main',
      }).success,
    ).toBe(false);
  });
});

describe('connection checks', () => {
  it('reports a writable local directory as healthy', async () => {
    const temp = await withTempDir();
    try {
      const result = await storageConfig.checkBackend(adminCtx, {
        type: 'local',
        config: { basePath: temp.dir },
      });
      expect(result.ok).toBe(true);
    } finally {
      await temp.cleanup();
    }
  });

  it('requires a secret to check an ad-hoc S3 backend', async () => {
    await expect(
      storageConfig.checkBackend(adminCtx, {
        type: 's3',
        config: { region: 'us-east-1', bucket: 'b', accessKeyId: 'AK' },
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });
});
