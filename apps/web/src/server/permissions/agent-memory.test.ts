import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { db, closeDb } from '@/server/db';
import * as schema from '@/server/db/schema';
import * as authService from '@/server/services/auth';
import * as apiKeyService from '@/server/services/api-keys';
import { requireAgentMemoryAccess } from '@/server/permissions/agent-memory';
import { buildApiKeyCtx, buildUserCtx } from '@/server/permissions';

beforeEach(async () => {
  await db.execute(sql`TRUNCATE TABLE api_keys, users, agent_memory_namespaces RESTART IDENTITY CASCADE`);
});

afterAll(async () => {
  await closeDb();
});

async function memoryKey(agentIdentity = 'hermes') {
  const { userId } = await authService.register({ email: `memory-permission-${crypto.randomUUID()}@example.com`, password: 'Password123!' });
  await db.update(schema.users).set({ role: 'admin' }).where(eq(schema.users.id, userId));
  const created = await apiKeyService.create(
    buildUserCtx(userId, 'admin'),
    'memory',
    ['memory.read', 'memory.write', 'memory.delete'],
    ['wiki'],
    { agentIdentity, displayName: 'memory' },
  );
  return { userId, created };
}

describe('Agent memory permissions', () => {
  it('derives access only from a bound key and required scope', async () => {
    const { userId, created } = await memoryKey();
    const access = await requireAgentMemoryAccess(
      buildApiKeyCtx(userId, 'admin', created.scopes, created.id),
      'memory.write',
    );
    expect(access.namespaceId).toBe(created.memoryDestination?.id);
    expect(access.agentIdentity).toBe('hermes');

    const diagnosticsAccess = await requireAgentMemoryAccess(
      buildApiKeyCtx(userId, 'admin', ['memory.delete'], created.id),
      'any',
    );
    expect(diagnosticsAccess.namespaceId).toBe(created.memoryDestination?.id);
  });

  it('resolves the configured agent identity from key metadata', async () => {
    const { userId, created } = await memoryKey('mino');
    const access = await requireAgentMemoryAccess(
      buildApiKeyCtx(userId, 'admin', created.scopes, created.id),
      'memory.read',
    );
    expect(access.agentIdentity).toBe('mino');
  });

  it('rejects generic page scopes, unbound keys, and disabled destinations', async () => {
    const { userId, created } = await memoryKey();
    await expect(requireAgentMemoryAccess(buildApiKeyCtx(userId, 'admin', ['view', 'edit'], created.id), 'memory.read')).rejects.toMatchObject({ code: 'AGENT_MEMORY_SCOPE_REQUIRED' });
    await expect(requireAgentMemoryAccess(buildApiKeyCtx(userId, 'admin', ['memory.read'], crypto.randomUUID()), 'memory.read')).rejects.toMatchObject({ code: 'AGENT_MEMORY_KEY_UNBOUND' });

    await db.update(schema.agentMemoryNamespaces)
      .set({ state: 'disabled', disabledAt: new Date() })
      .where(eq(schema.agentMemoryNamespaces.id, created.memoryDestination!.id));
    await expect(requireAgentMemoryAccess(buildApiKeyCtx(userId, 'admin', created.scopes, created.id), 'memory.read')).rejects.toMatchObject({ code: 'AGENT_MEMORY_NAMESPACE_UNAVAILABLE' });
  });
});
