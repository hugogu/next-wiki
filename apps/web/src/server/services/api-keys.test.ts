import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, closeDb } from '@/server/db';
import * as schema from '@/server/db/schema';
import * as authService from '@/server/services/auth';
import * as apiKeyService from '@/server/services/api-keys';
import { DomainError } from '@/server/errors';
import { buildUserCtx, buildAnonymousCtx, buildApiKeyCtx } from '@/server/permissions';

async function createTestUser(email: string) {
  const { userId } = await authService.register({ email, password: 'Password123!' });
  const user = await db.query.users.findFirst({ where: eq(schema.users.id, userId) });
  if (!user) throw new Error('Failed to create test user');
  return user;
}

describe('api-keys service', () => {
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

  describe('create', () => {
    it('generates a key with the nwk_ prefix and encrypts the secret', async () => {
      const user = await createTestUser('apikey-create@example.com');
      const ctx = buildUserCtx(user.id, user.role);

      const created = await apiKeyService.create(ctx, 'my-bot', ['view']);

      expect(created.keySecret).toMatch(/^nwk_/);
      expect(created.keyPrefix).toBe(created.keySecret.slice(0, 12));
      expect(created.scopes).toEqual(['view']);

      const row = await db.query.apiKeys.findFirst({
        where: eq(schema.apiKeys.id, created.id),
      });
      expect(row).toBeTruthy();
      expect(row!.keyPrefix).toBe(created.keyPrefix);
      expect(row!.keySecretEncrypted).not.toBe(created.keySecret);
    });

    it('rejects anonymous actor', async () => {
      await expect(
        apiKeyService.create(buildAnonymousCtx(), 'x', ['view']),
      ).rejects.toThrow(DomainError);
    });

    it('rejects an API-key actor (no key minting via key, prevents scope escalation)', async () => {
      const user = await createTestUser('apikey-mint@example.com');
      const ctx = buildApiKeyCtx(user.id, user.role, ['view'], 'some-key-id');

      await expect(apiKeyService.create(ctx, 'escalated', ['delete'])).rejects.toThrow(DomainError);
    });

    it('enforces per-user max key limit', async () => {
      const user = await createTestUser('apikey-max@example.com');
      const ctx = buildUserCtx(user.id, user.role);

      for (let i = 0; i < 10; i++) {
        await apiKeyService.create(ctx, `key-${i}`, ['view']);
      }

      await expect(apiKeyService.create(ctx, 'overflow', ['view'])).rejects.toThrow(DomainError);
    });
  });

  describe('list', () => {
    it("returns only the user's keys", async () => {
      const userA = await createTestUser('apikey-list-a@example.com');
      const userB = await createTestUser('apikey-list-b@example.com');
      const ctxA = buildUserCtx(userA.id, userA.role);
      const ctxB = buildUserCtx(userB.id, userB.role);

      const keyA = await apiKeyService.create(ctxA, 'a-key', ['view']);
      await apiKeyService.create(ctxB, 'b-key', ['view']);

      const list = await apiKeyService.list(ctxA);
      expect(list).toHaveLength(1);
      expect(list[0]!.id).toBe(keyA.id);
      expect(list[0]!).not.toHaveProperty('keySecret');
    });
  });

  describe('reveal', () => {
    it('decrypts the stored secret', async () => {
      const user = await createTestUser('apikey-reveal@example.com');
      const ctx = buildUserCtx(user.id, user.role);
      const created = await apiKeyService.create(ctx, 'reveal-key', ['view']);

      const revealed = await apiKeyService.reveal(ctx, created.id);
      expect(revealed.keySecret).toBe(created.keySecret);
    });

    it('rejects cross-user reveal', async () => {
      const userA = await createTestUser('apikey-reveal-a@example.com');
      const userB = await createTestUser('apikey-reveal-b@example.com');
      const ctxA = buildUserCtx(userA.id, userA.role);
      const ctxB = buildUserCtx(userB.id, userB.role);

      const created = await apiKeyService.create(ctxA, 'secret-key', ['view']);

      await expect(apiKeyService.reveal(ctxB, created.id)).rejects.toThrow(DomainError);
    });
  });

  describe('revoke', () => {
    it('sets revoked_at', async () => {
      const user = await createTestUser('apikey-revoke@example.com');
      const ctx = buildUserCtx(user.id, user.role);
      const created = await apiKeyService.create(ctx, 'revoke-key', ['view']);

      await apiKeyService.revoke(ctx, created.id);

      const row = await db.query.apiKeys.findFirst({
        where: eq(schema.apiKeys.id, created.id),
      });
      expect(row!.revokedAt).not.toBeNull();
    });
  });

  describe('lookupByToken', () => {
    it('resolves a valid key', async () => {
      const user = await createTestUser('apikey-lookup@example.com');
      const ctx = buildUserCtx(user.id, user.role);
      const created = await apiKeyService.create(ctx, 'lookup-key', ['view']);

      const resolved = await apiKeyService.lookupByToken(created.keySecret);
      expect(resolved).toBeTruthy();
      expect(resolved!.userId).toBe(user.id);
      expect(resolved!.scopes).toEqual(['view']);
    });

    it('rejects an invalid token', async () => {
      const resolved = await apiKeyService.lookupByToken('nwk_invalidtoken');
      expect(resolved).toBeNull();
    });

    it('rejects a revoked key', async () => {
      const user = await createTestUser('apikey-revoked-lookup@example.com');
      const ctx = buildUserCtx(user.id, user.role);
      const created = await apiKeyService.create(ctx, 'revoked-lookup-key', ['view']);
      await apiKeyService.revoke(ctx, created.id);

      const resolved = await apiKeyService.lookupByToken(created.keySecret);
      expect(resolved).toBeNull();
    });
  });
});
