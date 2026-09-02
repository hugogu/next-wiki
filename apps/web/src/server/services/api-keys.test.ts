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

    it('creates a key carrying the new storage and preferences scopes', async () => {
      const user = await createTestUser('apikey-scopes@example.com');
      const ctx = buildUserCtx(user.id, user.role);

      const created = await apiKeyService.create(ctx, 'scoped-bot', ['storage', 'preferences']);
      expect(created.scopes).toEqual(['storage', 'preferences']);

      const row = await db.query.apiKeys.findFirst({ where: eq(schema.apiKeys.id, created.id) });
      expect(row!.scopes).toEqual(['storage', 'preferences']);
    });

    it('creates an isolated destination for a dedicated Agent memory key', async () => {
      const user = await createTestUser('apikey-agent-memory@example.com');
      await db.update(schema.users).set({ role: 'admin' }).where(eq(schema.users.id, user.id));
      const ctx = buildUserCtx(user.id, 'admin');

      const created = await apiKeyService.create(
        ctx,
        'hermes',
        ['view', 'memory.read', 'memory.write', 'memory.delete'],
        ['wiki', 'raw', 'generated'],
        { agentIdentity: "hermes", displayName: 'Hermes personal memory' },
      );

      expect(created.memoryDestination).toMatchObject({ agentIdentity: "hermes", displayName: 'Hermes personal memory', state: 'active' });
      expect(created.scopes).toEqual(['view', 'memory.read', 'memory.write', 'memory.delete']);
      expect(created.spaceAccess).toEqual(['wiki', 'raw', 'generated']);
      const binding = await db.query.agentMemoryKeyBindings.findFirst({
        where: eq(schema.agentMemoryKeyBindings.apiKeyId, created.id),
      });
      expect(binding?.namespaceId).toBe(created.memoryDestination?.id);
    });

    it('requires an admin-owned dedicated destination for memory scopes', async () => {
      const user = await createTestUser('apikey-hermes-invalid@example.com');
      await db.update(schema.users).set({ role: 'editor' }).where(eq(schema.users.id, user.id));
      const ctx = buildUserCtx(user.id, 'editor');

      await expect(apiKeyService.create(ctx, 'missing-destination', ['memory.read'])).rejects.toThrow(DomainError);
      await expect(apiKeyService.create(ctx, 'not-admin', ['memory.read'], ['wiki'], { agentIdentity: "hermes", displayName: 'memory' })).rejects.toThrow(DomainError);
    });

    it('only lets the owner explicitly reuse an active Hermes destination', async () => {
      const user = await createTestUser('apikey-hermes-share@example.com');
      await db.update(schema.users).set({ role: 'admin' }).where(eq(schema.users.id, user.id));
      const ctx = buildUserCtx(user.id, 'admin');
      const first = await apiKeyService.create(ctx, 'first', ['memory.read'], ['wiki'], { agentIdentity: "hermes", displayName: 'shared' });
      const destinationId = first.memoryDestination!.id;

      const second = await apiKeyService.create(ctx, 'second', ['memory.read'], ['wiki'], { agentIdentity: "hermes", sharedNamespaceId: destinationId });
      expect(second.memoryDestination?.id).toBe(destinationId);

      const other = await createTestUser('apikey-hermes-other@example.com');
      await db.update(schema.users).set({ role: 'admin' }).where(eq(schema.users.id, other.id));
      await expect(
        apiKeyService.create(buildUserCtx(other.id, 'admin'), 'other', ['memory.read'], ['wiki'], { agentIdentity: "hermes", sharedNamespaceId: destinationId }),
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

    // 046: spaceAccess is an independent grant from scopes, gated at creation
    // time by the owning user's current role (not by the key's own scopes).
    describe('spaceAccess', () => {
      it('defaults to wiki-only when omitted', async () => {
        const user = await createTestUser('apikey-space-default@example.com');
        const ctx = buildUserCtx(user.id, user.role);

        const created = await apiKeyService.create(ctx, 'no-space-arg', ['view']);
        expect(created.spaceAccess).toEqual(['wiki']);
      });

      it('normalizes wiki into the stored list even when the caller omits it', async () => {
        const user = await createTestUser('apikey-space-normalize@example.com');
        await db.update(schema.users).set({ role: 'admin' }).where(eq(schema.users.id, user.id));
        const ctx = buildUserCtx(user.id, 'admin');

        const created = await apiKeyService.create(ctx, 'wiki-implicit', ['view'], ['raw']);
        expect(created.spaceAccess).toEqual(['wiki', 'raw']);
      });

      it('rejects raw/generated for a non-admin owner', async () => {
        const user = await createTestUser('apikey-space-nonadmin@example.com');
        await db.update(schema.users).set({ role: 'editor' }).where(eq(schema.users.id, user.id));
        const ctx = buildUserCtx(user.id, 'editor');

        await expect(
          apiKeyService.create(ctx, 'wants-raw', ['view'], ['wiki', 'raw']),
        ).rejects.toThrow(DomainError);
      });

      it('allows raw/generated for an admin owner', async () => {
        const user = await createTestUser('apikey-space-admin@example.com');
        await db.update(schema.users).set({ role: 'admin' }).where(eq(schema.users.id, user.id));
        const ctx = buildUserCtx(user.id, 'admin');

        const created = await apiKeyService.create(ctx, 'admin-key', ['view'], ['wiki', 'raw', 'generated']);
        expect(created.spaceAccess).toEqual(['wiki', 'raw', 'generated']);

        const row = await db.query.apiKeys.findFirst({ where: eq(schema.apiKeys.id, created.id) });
        expect(row!.spaceAccess).toEqual(['wiki', 'raw', 'generated']);
      });
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
      expect(resolved!.spaceAccess).toEqual(['wiki']);
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
