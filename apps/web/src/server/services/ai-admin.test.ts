import { eq } from 'drizzle-orm';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { buildUserCtx } from '@/server/permissions';
import { decryptAiJson } from '@/server/crypto/ai-encryption';
import { clearAiData, createAiTestUser, removeAiTestUser } from '../../../test/ai-fixtures';
import {
  assignPurpose,
  createManualModel,
  createProvider,
  deleteProvider,
  listModels,
  setCapabilityOverride,
  updateProvider,
} from './ai-admin';

describe('AI administration service', () => {
  let adminId: string;
  beforeEach(async () => {
    await clearAiData();
    adminId = await createAiTestUser('admin');
  });
  afterEach(async () => removeAiTestUser(adminId));

  it('preserves encrypted credentials across non-secret updates', async () => {
    const ctx = buildUserCtx(adminId, 'admin');
    const provider = await createProvider(ctx, {
      name: 'Fixture',
      vendor: 'custom',
      kind: 'openai_compatible',
      baseUrl: 'https://example.com/v1',
      credentials: { apiKey: 'private-key' },
    });
    const before = await db.query.aiProviders.findFirst({ where: eq(schema.aiProviders.id, provider.id) });
    expect(before?.credentialsEncrypted).not.toContain('private-key');
    expect(decryptAiJson(before!.credentialsEncrypted)).toEqual({ apiKey: 'private-key' });
    await updateProvider(ctx, provider.id, { name: 'Renamed' });
    const after = await db.query.aiProviders.findFirst({ where: eq(schema.aiProviders.id, provider.id) });
    expect(after?.credentialsEncrypted).toBe(before?.credentialsEncrypted);
    await deleteProvider(ctx, provider.id);
  });

  it('applies manual capability precedence and validates purpose assignments', async () => {
    const ctx = buildUserCtx(adminId, 'admin');
    const provider = await createProvider(ctx, {
      name: 'Models',
      vendor: 'custom',
      kind: 'openai_compatible',
      baseUrl: 'https://example.com/v1',
      credentials: { apiKey: 'key' },
    });
    const model = await createManualModel(ctx, provider.id, {
      externalId: 'model',
      displayName: 'Model',
      contextWindow: 8_000,
    });
    await setCapabilityOverride(ctx, model.id, 'text_generation', false, { confirmed: false });
    await expect(assignPurpose(ctx, 'wiki_text', model.id)).rejects.toMatchObject({ code: 'CAPABILITY_MISMATCH' });
    await setCapabilityOverride(ctx, model.id, 'text_generation', true, { confirmed: true });
    expect((await listModels(ctx, provider.id))[0]?.capabilities).toContainEqual(
      expect.objectContaining({ capability: 'text_generation', supported: true, source: 'manual' }),
    );
    await expect(assignPurpose(ctx, 'wiki_text', model.id)).resolves.toMatchObject({ modelId: model.id });
  });
});
