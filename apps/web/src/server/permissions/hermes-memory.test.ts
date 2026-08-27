import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { db, closeDb } from '@/server/db';
import * as schema from '@/server/db/schema';
import * as authService from '@/server/services/auth';
import * as apiKeyService from '@/server/services/api-keys';
import { requireHermesMemoryAccess } from '@/server/permissions/hermes-memory';
import { buildApiKeyCtx, buildUserCtx } from '@/server/permissions';

beforeEach(async () => {
  await db.execute(sql`TRUNCATE TABLE api_keys, users, hermes_memory_namespaces RESTART IDENTITY CASCADE`);
});

afterAll(async () => {
  await closeDb();
});

async function memoryKey() {
  const { userId } = await authService.register({ email: `memory-permission-${crypto.randomUUID()}@example.com`, password: 'Password123!' });
  await db.update(schema.users).set({ role: 'admin' }).where(eq(schema.users.id, userId));
  const created = await apiKeyService.create(
    buildUserCtx(userId, 'admin'),
    'memory',
    ['memory.read', 'memory.write', 'memory.delete'],
    ['wiki'],
    { displayName: 'memory' },
  );
  return { userId, created };
}

describe('Hermes memory permissions', () => {
  it('derives access only from a bound key and required scope', async () => {
    const { userId, created } = await memoryKey();
    const access = await requireHermesMemoryAccess(
      buildApiKeyCtx(userId, 'admin', created.scopes, created.id),
      'memory.write',
    );
    expect(access.namespaceId).toBe(created.hermesMemoryDestination?.id);

    const diagnosticsAccess = await requireHermesMemoryAccess(
      buildApiKeyCtx(userId, 'admin', ['memory.delete'], created.id),
      'any',
    );
    expect(diagnosticsAccess.namespaceId).toBe(created.hermesMemoryDestination?.id);
  });

  it('rejects generic page scopes, unbound keys, and disabled destinations', async () => {
    const { userId, created } = await memoryKey();
    await expect(requireHermesMemoryAccess(buildApiKeyCtx(userId, 'admin', ['view', 'edit'], created.id), 'memory.read')).rejects.toMatchObject({ code: 'HERMES_MEMORY_SCOPE_REQUIRED' });
    await expect(requireHermesMemoryAccess(buildApiKeyCtx(userId, 'admin', ['memory.read'], crypto.randomUUID()), 'memory.read')).rejects.toMatchObject({ code: 'HERMES_MEMORY_KEY_UNBOUND' });

    await db.update(schema.hermesMemoryNamespaces)
      .set({ state: 'disabled', disabledAt: new Date() })
      .where(eq(schema.hermesMemoryNamespaces.id, created.hermesMemoryDestination!.id));
    await expect(requireHermesMemoryAccess(buildApiKeyCtx(userId, 'admin', created.scopes, created.id), 'memory.read')).rejects.toMatchObject({ code: 'HERMES_MEMORY_NAMESPACE_UNAVAILABLE' });
  });
});
