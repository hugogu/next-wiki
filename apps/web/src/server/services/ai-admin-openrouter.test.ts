import { asc, eq } from 'drizzle-orm';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { buildUserCtx } from '@/server/permissions';
import { decryptAiJson } from '@/server/crypto/ai-encryption';
import { clearAiData, createAiTestUser, removeAiTestUser } from '../../../test/ai-fixtures';

// Registering OpenRouter providers best-effort syncs each catalog. Stub the
// network-touching discovery paths so the suite stays offline and deterministic
// while still exercising the provider-creation and naming guarantees.
vi.mock('@/server/ai/model-detector', () => ({
  detectCapabilities: vi.fn(async () => null),
  listEmbeddingModels: vi.fn(async () => []),
  clearDetectorCache: vi.fn(),
}));
vi.mock('@/server/ai/registry', () => ({
  createAiProviderAdapter: vi.fn(() => ({ listModels: vi.fn(async () => []) })),
  createModelDiscoveryAdapter: vi.fn(() => ({ listModels: vi.fn(async () => []) })),
}));

import { registerOpenRouterProviders, updateSettings } from './ai-admin';

async function openRouterProviders() {
  return db
    .select({ name: schema.aiProviders.name, type: schema.aiProviders.type, vendor: schema.aiProviders.vendor })
    .from(schema.aiProviders)
    .where(eq(schema.aiProviders.vendor, 'openrouter'))
    .orderBy(asc(schema.aiProviders.name));
}

describe('OpenRouter provider registration', () => {
  let adminId: string;
  beforeEach(async () => {
    await clearAiData();
    adminId = await createAiTestUser('admin');
  });
  afterEach(async () => removeAiTestUser(adminId));

  it('registers one distinctly-named provider per capability', async () => {
    const ctx = buildUserCtx(adminId, 'admin');
    const created = await registerOpenRouterProviders(ctx, 'router-key');
    expect(created).toHaveLength(3);

    const providers = await openRouterProviders();
    expect(providers).toEqual([
      { name: 'OpenRouter Chat', type: 'chat', vendor: 'openrouter' },
      { name: 'OpenRouter Embedding', type: 'embedding', vendor: 'openrouter' },
      { name: 'OpenRouter Image', type: 'image', vendor: 'openrouter' },
    ]);
    // Providers of different types must not share a name.
    expect(new Set(providers.map((p) => p.name)).size).toBe(3);

    const stored = await db.query.aiProviders.findFirst({
      where: eq(schema.aiProviders.name, 'OpenRouter Chat'),
    });
    expect(decryptAiJson(stored!.credentialsEncrypted)).toEqual({ apiKey: 'router-key' });
  });

  it('is idempotent when providers already exist', async () => {
    const ctx = buildUserCtx(adminId, 'admin');
    await registerOpenRouterProviders(ctx, 'router-key');
    // A second run finds every name taken and creates nothing new.
    await expect(registerOpenRouterProviders(ctx, 'router-key')).resolves.toEqual([]);
    expect(await openRouterProviders()).toHaveLength(3);
  });

  it('bootstraps providers when the detector key is saved with the opt-in', async () => {
    const ctx = buildUserCtx(adminId, 'admin');
    await updateSettings(ctx, {
      modelDetectorApiKey: 'router-key',
      registerOpenRouterProviders: true,
    });
    expect(await openRouterProviders()).toHaveLength(3);

    const settings = await db.query.aiSettings.findFirst();
    expect(settings?.modelDetectorApiKeyEncrypted).toBeTruthy();
  });

  it('leaves providers untouched when the opt-in is off', async () => {
    const ctx = buildUserCtx(adminId, 'admin');
    await updateSettings(ctx, { modelDetectorApiKey: 'router-key' });
    expect(await openRouterProviders()).toHaveLength(0);
  });
});
