import { beforeAll, afterAll, beforeEach, describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, closeDb } from '@/server/db';
import * as schema from '@/server/db/schema';
import { buildUserCtx, type PermCtx } from '@/server/permissions';
import { decryptKey } from '@/server/crypto/key-encryption';
import * as feishuConfig from '@/server/services/feishu-config';

let adminCtx: PermCtx;
let editorCtx: PermCtx;

async function cleanup() {
  await db.delete(schema.feishuIntegrationConfig);
  await db.delete(schema.sessions);
  await db.delete(schema.users);
}

beforeAll(async () => {
  await cleanup();
  const [admin] = await db
    .insert(schema.users)
    .values({ email: 'fc-admin@example.com', passwordHash: 'HASH', role: 'admin' })
    .returning();
  const [editor] = await db
    .insert(schema.users)
    .values({ email: 'fc-editor@example.com', passwordHash: 'HASH', role: 'editor' })
    .returning();
  adminCtx = buildUserCtx(admin!.id, 'admin');
  editorCtx = buildUserCtx(editor!.id, 'editor');
});

beforeEach(async () => {
  await db.delete(schema.feishuIntegrationConfig);
});

afterAll(async () => {
  await cleanup();
  await closeDb();
});

describe('feishu-config service', () => {
  it('hides the surface from non-admins', async () => {
    await expect(feishuConfig.getConfigView(editorCtx)).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    await expect(feishuConfig.updateConfig(editorCtx, { appId: 'cli_x' })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  it('returns a disabled default view for an unconfigured deployment', async () => {
    const view = await feishuConfig.getConfigView(adminCtx);
    expect(view.enabled).toBe(false);
    expect(view.appId).toBeNull();
    expect(view.hasAppSecret).toBe(false);
    // An unconfigured deployment is inactive in-process.
    expect(await feishuConfig.getDecryptedConfig()).toBeNull();
    expect(await feishuConfig.isFeishuConfigured()).toBe(false);
  });

  it('stores secrets write-only and never returns plaintext', async () => {
    const view = await feishuConfig.updateConfig(adminCtx, {
      appId: 'cli_app',
      appSecret: 'super-secret',
    });
    expect(view.hasAppSecret).toBe(true);
    // The masked view exposes no plaintext secret.
    expect(JSON.stringify(view)).not.toContain('super-secret');

    // The stored columns are ciphertext, decryptable in-process only.
    const row = await db.query.feishuIntegrationConfig.findFirst({
      where: eq(schema.feishuIntegrationConfig.id, 'default'),
    });
    expect(row!.appSecretEncrypted).not.toBe('super-secret');
    expect(decryptKey(row!.appSecretEncrypted!)).toBe('super-secret');
  });

  it('preserves stored secrets when a later update omits them', async () => {
    await feishuConfig.updateConfig(adminCtx, {
      appId: 'cli_app',
      appSecret: 'secret-1',
    });
    await feishuConfig.updateConfig(adminCtx, { enabled: true });
    const row = await db.query.feishuIntegrationConfig.findFirst({
      where: eq(schema.feishuIntegrationConfig.id, 'default'),
    });
    expect(decryptKey(row!.appSecretEncrypted!)).toBe('secret-1');
    expect(row!.enabled).toBe(true);
  });

  it('refuses to enable without the required secrets', async () => {
    await expect(
      feishuConfig.updateConfig(adminCtx, { enabled: true, appId: 'cli_app' }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('enables and exposes the decrypted runtime config in-process', async () => {
    await feishuConfig.updateConfig(adminCtx, {
      appId: 'cli_app',
      appSecret: 'secret',
      enabled: true,
    });
    const runtime = await feishuConfig.getDecryptedConfig();
    expect(runtime).not.toBeNull();
    expect(runtime!.appId).toBe('cli_app');
    expect(runtime!.appSecret).toBe('secret');
    expect(await feishuConfig.isFeishuConfigured()).toBe(true);
  });
});
