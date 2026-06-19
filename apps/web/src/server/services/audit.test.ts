import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, closeDb } from '@/server/db';
import * as schema from '@/server/db/schema';
import * as authService from '@/server/services/auth';
import * as auditService from '@/server/services/audit';
import * as apiKeyService from '@/server/services/api-keys';
import { DomainError } from '@/server/errors';
import { buildUserCtx } from '@/server/permissions';

async function createTestUser(email: string, role: 'admin' | 'editor' | 'reader' = 'reader') {
  const { userId } = await authService.register({ email, password: 'Password123!' });
  if (role !== 'reader') {
    await db.update(schema.users).set({ role }).where(eq(schema.users.id, userId));
  }
  const user = await db.query.users.findFirst({ where: eq(schema.users.id, userId) });
  if (!user) throw new Error('Failed to create test user');
  return user;
}

describe('audit service', () => {
  beforeAll(async () => {
    await db.delete(schema.apiAuditEntries);
    await db.delete(schema.apiKeys);
    await db.delete(schema.pageRevisions);
    await db.delete(schema.pages);
    await db.delete(schema.sessions);
    await db.delete(schema.users);
  });

  afterAll(async () => {
    await closeDb();
  });

  describe('listOwn', () => {
    it("returns only the user's entries", async () => {
      const userA = await createTestUser('audit-a@example.com');
      const userB = await createTestUser('audit-b@example.com');

      await auditService.writeEntry({
        keyId: null,
        userId: userA.id,
        method: 'GET',
        path: '/api/pages',
        statusCode: 200,
        durationMs: 10,
        authStatus: 'authenticated',
        errorMessage: null,
      });
      await auditService.writeEntry({
        keyId: null,
        userId: userB.id,
        method: 'GET',
        path: '/api/pages',
        statusCode: 200,
        durationMs: 10,
        authStatus: 'authenticated',
        errorMessage: null,
      });

      const result = await auditService.listOwn(buildUserCtx(userA.id, userA.role), {
        page: 1,
        pageSize: 20,
      });
      expect(result.entries).toHaveLength(1);
      expect(result.entries[0]!.userId).toBe(userA.id);
    });

    it('filters by keyId', async () => {
      const user = await createTestUser('audit-key@example.com');
      const ctx = buildUserCtx(user.id, user.role);
      const keyA = await apiKeyService.create(ctx, 'key-a', ['view']);
      const keyB = await apiKeyService.create(ctx, 'key-b', ['view']);
      await auditService.writeEntry({
        keyId: keyA.id,
        userId: user.id,
        method: 'GET',
        path: '/api/pages',
        statusCode: 200,
        durationMs: 10,
        authStatus: 'authenticated',
        errorMessage: null,
      });
      await auditService.writeEntry({
        keyId: keyB.id,
        userId: user.id,
        method: 'GET',
        path: '/api/pages',
        statusCode: 200,
        durationMs: 10,
        authStatus: 'authenticated',
        errorMessage: null,
      });

      const result = await auditService.listOwn(ctx, {
        page: 1,
        pageSize: 20,
        keyId: keyA.id,
      });
      expect(result.entries).toHaveLength(1);
      expect(result.entries[0]!.keyId).toBe(keyA.id);
    });

    it('status=error returns only 4xx/5xx', async () => {
      const user = await createTestUser('audit-status@example.com');
      await auditService.writeEntry({
        keyId: null,
        userId: user.id,
        method: 'GET',
        path: '/api/pages',
        statusCode: 200,
        durationMs: 10,
        authStatus: 'authenticated',
        errorMessage: null,
      });
      await auditService.writeEntry({
        keyId: null,
        userId: user.id,
        method: 'GET',
        path: '/api/missing',
        statusCode: 404,
        durationMs: 5,
        authStatus: 'authenticated',
        errorMessage: null,
      });
      await auditService.writeEntry({
        keyId: null,
        userId: user.id,
        method: 'GET',
        path: '/api/boom',
        statusCode: 500,
        durationMs: 5,
        authStatus: 'authenticated',
        errorMessage: null,
      });

      const result = await auditService.listOwn(buildUserCtx(user.id, user.role), {
        page: 1,
        pageSize: 20,
        status: 'error',
      });
      expect(result.entries).toHaveLength(2);
      expect(result.entries.every((e) => e.statusCode >= 400)).toBe(true);
    });

    it('status=success returns only 2xx/3xx (excludes 4xx/5xx)', async () => {
      const user = await createTestUser('audit-status-success@example.com');
      for (const statusCode of [200, 302, 404, 500]) {
        await auditService.writeEntry({
          keyId: null,
          userId: user.id,
          method: 'GET',
          path: `/api/s${statusCode}`,
          statusCode,
          durationMs: 5,
          authStatus: 'authenticated',
          errorMessage: null,
        });
      }

      const result = await auditService.listOwn(buildUserCtx(user.id, user.role), {
        page: 1,
        pageSize: 20,
        status: 'success',
      });
      expect(result.entries).toHaveLength(2);
      expect(result.entries.every((e) => e.statusCode >= 200 && e.statusCode < 400)).toBe(true);
    });
  });

  describe('listAll', () => {
    it('requires admin', async () => {
      const reader = await createTestUser('audit-reader@example.com');
      await expect(
        auditService.listAll(buildUserCtx(reader.id, reader.role), { page: 1, pageSize: 20 }),
      ).rejects.toThrow(DomainError);
    });

    it('includes entries from all users and filters by userId', async () => {
      const admin = await createTestUser('audit-admin@example.com', 'admin');
      const userA = await createTestUser('audit-all-a@example.com');
      const userB = await createTestUser('audit-all-b@example.com');

      await auditService.writeEntry({
        keyId: null,
        userId: userA.id,
        method: 'GET',
        path: '/api/pages',
        statusCode: 200,
        durationMs: 10,
        authStatus: 'authenticated',
        errorMessage: null,
      });
      await auditService.writeEntry({
        keyId: null,
        userId: userB.id,
        method: 'GET',
        path: '/api/pages',
        statusCode: 200,
        durationMs: 10,
        authStatus: 'authenticated',
        errorMessage: null,
      });

      const all = await auditService.listAll(buildUserCtx(admin.id, admin.role), {
        page: 1,
        pageSize: 20,
      });
      expect(all.entries.length).toBeGreaterThanOrEqual(2);

      const filtered = await auditService.listAll(buildUserCtx(admin.id, admin.role), {
        page: 1,
        pageSize: 20,
        userId: userA.id,
      });
      expect(filtered.entries.every((e) => e.userId === userA.id)).toBe(true);
    });

    it('filters by time range', async () => {
      const admin = await createTestUser('audit-time@example.com', 'admin');
      const old = new Date(Date.now() - 86400000 * 2).toISOString();
      const recent = new Date().toISOString();

      await db.insert(schema.apiAuditEntries).values([
        {
          userId: admin.id,
          method: 'GET',
          path: '/api/old',
          statusCode: 200,
          durationMs: 1,
        authStatus: 'authenticated' as const,
        createdAt: new Date(old),
      },
      {
        userId: admin.id,
        method: 'GET',
        path: '/api/recent',
        statusCode: 200,
        durationMs: 1,
        authStatus: 'authenticated' as const,
        createdAt: new Date(recent),
      },
      ]);

      const start = new Date(Date.now() - 86400000);
      const result = await auditService.listAll(buildUserCtx(admin.id, admin.role), {
        page: 1,
        pageSize: 20,
        startTime: start,
      });
      expect(result.entries.every((e) => new Date(e.createdAt) >= start)).toBe(true);
    });
  });
});
