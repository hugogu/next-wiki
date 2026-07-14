import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';

const startAppRegistration = vi.hoisted(() => vi.fn());
const pollAppRegistration = vi.hoisted(() => vi.fn());
const startFeishuLongConnection = vi.hoisted(() => vi.fn());

vi.mock('@/server/feishu/app-registration', () => ({ startAppRegistration, pollAppRegistration }));
vi.mock('@/server/feishu/long-connection', () => ({ startFeishuLongConnection }));

import { decryptKey } from '@/server/crypto/key-encryption';
import { closeDb, db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { buildUserCtx, type PermCtx } from '@/server/permissions';
import * as registration from './feishu-app-registration';

let adminCtx: PermCtx;

async function cleanup() {
  await db.delete(schema.feishuAppRegistrationSessions);
  await db.delete(schema.feishuIntegrationConfig);
  await db.delete(schema.sessions);
  await db.delete(schema.users);
}

beforeAll(async () => {
  await cleanup();
  const [admin] = await db
    .insert(schema.users)
    .values({ email: 'feishu-qr-admin@example.com', passwordHash: 'HASH', role: 'admin' })
    .returning();
  adminCtx = buildUserCtx(admin!.id, 'admin');
});

beforeEach(async () => {
  await db.delete(schema.feishuAppRegistrationSessions);
  await db.delete(schema.feishuIntegrationConfig);
  startAppRegistration.mockReset();
  pollAppRegistration.mockReset();
  startFeishuLongConnection.mockReset();
  startFeishuLongConnection.mockResolvedValue(undefined);
});

afterAll(async () => {
  await cleanup();
  await closeDb();
});

describe('feishu-app-registration service', () => {
  it('keeps the device code encrypted and exchanges it for write-only credentials', async () => {
    startAppRegistration.mockResolvedValue({
      deviceCode: 'device-code-secret',
      qrUrl: 'https://accounts.feishu.cn/verify?code=example',
      pollIntervalSeconds: 5,
      expiresInSeconds: 600,
    });

    const started = await registration.beginFeishuAppRegistration(adminCtx, { domain: 'feishu' });
    const row = await db.query.feishuAppRegistrationSessions.findFirst({
      where: eq(schema.feishuAppRegistrationSessions.id, started.registrationId),
    });
    expect(row!.deviceCodeEncrypted).not.toContain('device-code-secret');
    expect(decryptKey(row!.deviceCodeEncrypted)).toBe('device-code-secret');

    pollAppRegistration.mockResolvedValue({
      status: 'completed',
      appId: 'cli_qr_app',
      appSecret: 'app-secret-from-feishu',
    });
    await expect(
      registration.checkFeishuAppRegistration(adminCtx, started.registrationId),
    ).resolves.toEqual({
      status: 'completed',
      appId: 'cli_qr_app',
    });

    const config = await db.query.feishuIntegrationConfig.findFirst({
      where: eq(schema.feishuIntegrationConfig.id, 'default'),
    });
    expect(config!.appId).toBe('cli_qr_app');
    expect(decryptKey(config!.appSecretEncrypted!)).toBe('app-secret-from-feishu');
    await expect(
      db.query.feishuAppRegistrationSessions.findFirst({
        where: eq(schema.feishuAppRegistrationSessions.id, started.registrationId),
      }),
    ).resolves.toBeUndefined();
  });

  it('does not allow another administrator to poll a registration', async () => {
    const [otherAdmin] = await db
      .insert(schema.users)
      .values({ email: 'feishu-qr-other@example.com', passwordHash: 'HASH', role: 'admin' })
      .returning();
    startAppRegistration.mockResolvedValue({
      deviceCode: 'device-code-secret',
      qrUrl: 'https://accounts.feishu.cn/verify?code=example',
      pollIntervalSeconds: 5,
      expiresInSeconds: 600,
    });
    const started = await registration.beginFeishuAppRegistration(adminCtx, { domain: 'feishu' });

    await expect(
      registration.checkFeishuAppRegistration(
        buildUserCtx(otherAdmin!.id, 'admin'),
        started.registrationId,
      ),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
