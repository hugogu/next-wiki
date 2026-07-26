import { beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, closeDb } from '@/server/db';
import * as schema from '@/server/db/schema';
import * as auth from '@/server/services/auth';
import { buildUserCtx } from '@/server/permissions';
import { encryptAiJson } from '@/server/crypto/ai-encryption';
import {
  cleanupExpiredRequestLogs,
  getRequestLogDetail,
  getRequestLogSettings,
  listRequestLogs,
  persistOutboundRequestLog,
  updateRequestLogSettings,
} from './request-log';

async function createUser(email: string, role: 'admin' | 'editor') {
  const { userId } = await auth.register({ email, password: 'Password123!' });
  await db.update(schema.users).set({ role }).where(eq(schema.users.id, userId));
  return buildUserCtx(userId, role);
}

describe('request log service', () => {
  beforeAll(async () => {
    await db.delete(schema.outboundRequestLogs);
    await db.delete(schema.requestLogSettings);
  });

  it('restricts settings to admins and requires All confirmation', async () => {
    const editor = await createUser('request-log-editor@example.com', 'editor');
    const admin = await createUser('request-log-admin@example.com', 'admin');
    await expect(getRequestLogSettings(editor)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(
      updateRequestLogSettings(admin, { enabled: true, level: 'all', retentionHours: 24 }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    const result = await updateRequestLogSettings(admin, {
      enabled: true,
      level: 'all',
      retentionHours: 24,
      confirmSensitiveCapture: true,
    });
    expect(result.settings).toMatchObject({ enabled: true, level: 'all', retentionHours: 24 });
    expect(result.auditMetadata.previous.enabled).toBe(false);
  });

  it('persists a preassigned id idempotently and only decrypts detail for admins', async () => {
    const admin = await createUser('request-log-reader@example.com', 'admin');
    const id = '00000000-0000-4000-8000-000000000101';
    const now = new Date();
    const payload = {
      id,
      sourceType: 'ai',
      providerKey: 'fixture',
      operation: 'chat.completions',
      attempt: 1,
      method: 'POST',
      targetHost: 'provider.example',
      targetPath: '/v1/chat/completions',
      statusCode: 200,
      outcome: 'success' as const,
      startedAt: now.toISOString(),
      completedAt: now.toISOString(),
      durationMs: 1,
      captureLevel: 'all' as const,
      expiresAt: new Date(now.getTime() + 60_000).toISOString(),
      targetEncrypted: encryptAiJson('https://provider.example/v1/chat/completions'),
      requestHeadersEncrypted: encryptAiJson([
        { name: 'authorization', values: ['Bearer secret'] },
      ]),
      requestBodyEncrypted: encryptAiJson({
        encoding: 'utf8' as const,
        contentType: 'application/json',
        contentEncoding: null,
        byteLength: 2,
        data: '{}',
      }),
    };
    await persistOutboundRequestLog(payload);
    await persistOutboundRequestLog(payload);
    expect(await db.query.outboundRequestLogs.findFirst({ where: eq(schema.outboundRequestLogs.id, id) })).toBeDefined();
    const list = await listRequestLogs(admin, { page: 1, pageSize: 20 });
    expect(list.entries.filter((entry) => entry.id === id)).toHaveLength(1);
    expect(list.entries.find((entry) => entry.id === id)?.targetHost).toBe('provider.example');
    const detail = await getRequestLogDetail(admin, id);
    expect(detail.target).toContain('provider.example');
    expect(detail.requestHeaders).toEqual([{ name: 'authorization', values: ['Bearer secret'] }]);
  });

  it('removes expired rows without affecting unexpired rows', async () => {
    const now = new Date();
    await db
      .insert(schema.outboundRequestLogs)
      .values({
        id: '00000000-0000-4000-8000-000000000102',
        sourceType: 'ai',
        operation: 'models',
        attempt: 1,
        method: 'GET',
        outcome: 'success',
        startedAt: now,
        completedAt: now,
        durationMs: 0,
        captureLevel: 'status',
        expiresAt: new Date(now.getTime() - 1_000),
      });
    expect(await cleanupExpiredRequestLogs()).toBeGreaterThanOrEqual(1);
    expect(
      await db.query.outboundRequestLogs.findFirst({
        where: eq(schema.outboundRequestLogs.id, '00000000-0000-4000-8000-000000000102'),
      }),
    ).toBeUndefined();
  });

  afterAll(async () => {
    await closeDb();
  });
});
