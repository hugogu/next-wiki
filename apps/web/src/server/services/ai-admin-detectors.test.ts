import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { buildUserCtx } from '@/server/permissions';
import { encryptAiJson } from '@/server/crypto/ai-encryption';
import { clearAiData, createAiTestUser, removeAiTestUser } from '../../../test/ai-fixtures';
import { cloudflareModel, cloudflareSchema, stubFetch } from '@/server/ai/model-detectors/test-helpers';
import {
  createProvider,
  listModels,
  setCapabilityOverride,
  syncProviderModels,
} from './ai-admin';

function isSearch(url: string) {
  return url.includes('/ai/models/search');
}

/** A Cloudflare-detector-backed provider: config selects the detector source. */
async function createCloudflareProvider(ctx: ReturnType<typeof buildUserCtx>) {
  return createProvider(ctx, {
    name: 'Cloudflare Detector',
    type: 'chat',
    vendor: 'custom',
    kind: 'openai_compatible',
    baseUrl: 'https://example.invalid/v1',
    config: { modelDetector: { source: 'cloudflare', cloudflareAccountId: 'acct-1', hideExperimental: false } },
    credentials: { apiKey: 'cf-token' },
  });
}

describe('detector-backed model sync', () => {
  let adminId: string;
  beforeEach(async () => {
    await clearAiData();
    adminId = await createAiTestUser('admin');
  });
  afterEach(async () => {
    vi.unstubAllGlobals();
    await removeAiTestUser(adminId);
  });

  it('merges Cloudflare detected models and reports added/updated/partial counts', async () => {
    const ctx = buildUserCtx(adminId, 'admin');
    const provider = await createCloudflareProvider(ctx);

    stubFetch((url) => {
      if (isSearch(url)) {
        return {
          body: {
            success: true,
            result: [
              cloudflareModel('@cf/meta/llama', 'Text Generation'),
              cloudflareModel('@cf/broken/model', 'Text Generation'),
            ],
          },
        };
      }
      if (url.includes('broken')) return { status: 500, body: { success: false } };
      return { body: cloudflareSchema({ prompt: {} }, { response: {} }) };
    });

    const result = await syncProviderModels(provider.id);
    expect(result.detectorSource).toBe('cloudflare');
    expect(result.count).toBe(2);
    expect(result.added).toBe(2);
    expect(result.partial).toBe(1);
    expect(result.warnings).toContainEqual({ modelExternalId: '@cf/broken/model', code: 'SCHEMA_UNAVAILABLE' });

    const models = await listModels(ctx, provider.id);
    expect(models.map((m) => m.externalId).sort()).toEqual(['@cf/broken/model', '@cf/meta/llama']);
    const llama = models.find((m) => m.externalId === '@cf/meta/llama')!;
    expect(llama.capabilities).toContainEqual(
      expect.objectContaining({ capability: 'text_generation', source: 'provider' }),
    );

    // A second run updates rather than adds.
    const second = await syncProviderModels(provider.id);
    expect(second.added).toBe(0);
    expect(second.updated).toBe(2);
  });

  it('marks previously detected but now-missing models unavailable without deleting', async () => {
    const ctx = buildUserCtx(adminId, 'admin');
    const provider = await createCloudflareProvider(ctx);

    let catalog = [cloudflareModel('@cf/a', 'Text Generation'), cloudflareModel('@cf/b', 'Text Generation')];
    const handler = stubFetch((url) => {
      if (isSearch(url)) return { body: { success: true, result: catalog } };
      return { body: cloudflareSchema({ prompt: {} }, { response: {} }) };
    });
    void handler;

    await syncProviderModels(provider.id);
    // Drop @cf/b from the catalog on the next run.
    catalog = [cloudflareModel('@cf/a', 'Text Generation')];
    const result = await syncProviderModels(provider.id);
    expect(result.unavailable).toBeGreaterThanOrEqual(1);

    const models = await listModels(ctx, provider.id);
    const dropped = models.find((m) => m.externalId === '@cf/b')!;
    expect(dropped).toBeDefined();
    expect(dropped.availability).toBe('unavailable');
  });

  it('preserves manual capability overrides across a detector sync', async () => {
    const ctx = buildUserCtx(adminId, 'admin');
    const provider = await createCloudflareProvider(ctx);

    stubFetch((url) => {
      if (isSearch(url)) return { body: { success: true, result: [cloudflareModel('@cf/a', 'Text Generation')] } };
      return { body: cloudflareSchema({ prompt: {} }, { response: {} }) };
    });
    await syncProviderModels(provider.id);

    const [model] = await listModels(ctx, provider.id);
    // Admin overrides vision to true manually; a later sync must not erase it.
    await setCapabilityOverride(ctx, model!.id, 'vision', true, { confirmed: true });
    await syncProviderModels(provider.id);

    const manual = await db.query.aiModelCapabilities.findFirst({
      where: and(
        eq(schema.aiModelCapabilities.modelId, model!.id),
        eq(schema.aiModelCapabilities.capability, 'vision'),
        eq(schema.aiModelCapabilities.source, 'manual'),
      ),
    });
    expect(manual?.supported).toBe(true);
    const view = (await listModels(ctx, provider.id)).find((m) => m.id === model!.id)!;
    expect(view.capabilities).toContainEqual(
      expect.objectContaining({ capability: 'vision', supported: true, source: 'manual' }),
    );
  });

  it('never overwrites a manually added model row', async () => {
    const ctx = buildUserCtx(adminId, 'admin');
    const provider = await createCloudflareProvider(ctx);
    // A manual model that shares an externalId with a detected one.
    const [manual] = await db
      .insert(schema.aiModels)
      .values({
        providerId: provider.id,
        externalId: '@cf/a',
        displayName: 'Hand-curated name',
        manuallyAdded: true,
        availability: 'available',
      })
      .returning();

    stubFetch((url) => {
      if (isSearch(url)) return { body: { success: true, result: [cloudflareModel('@cf/a', 'Text Generation')] } };
      return { body: cloudflareSchema({ prompt: {} }, { response: {} }) };
    });
    const result = await syncProviderModels(provider.id);
    expect(result.skipped).toBeGreaterThanOrEqual(1);

    const row = await db.query.aiModels.findFirst({ where: eq(schema.aiModels.id, manual!.id) });
    expect(row?.displayName).toBe('Hand-curated name');
  });

  it('rejects creating a Cloudflare detector provider without an API token', async () => {
    const ctx = buildUserCtx(adminId, 'admin');
    await expect(
      createProvider(ctx, {
        name: 'No token',
        type: 'chat',
        vendor: 'custom',
        kind: 'openai_compatible',
        baseUrl: 'https://example.invalid/v1',
        config: { modelDetector: { source: 'cloudflare', cloudflareAccountId: 'acct-1' } },
        credentials: { headers: { 'x-marker': 'present' } },
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('fails a sync before any network call when the token was later cleared', async () => {
    const ctx = buildUserCtx(adminId, 'admin');
    const provider = await createCloudflareProvider(ctx);
    // Simulate the token being cleared out-of-band (credentials without apiKey).
    await db
      .update(schema.aiProviders)
      .set({ credentialsEncrypted: encryptAiJson({ headers: { 'x-marker': 'present' } }) })
      .where(eq(schema.aiProviders.id, provider.id));
    const mock = stubFetch(() => ({ body: {} }));
    await expect(syncProviderModels(provider.id)).rejects.toMatchObject({ code: expect.any(String) });
    expect(mock).not.toHaveBeenCalled();
  });
});
