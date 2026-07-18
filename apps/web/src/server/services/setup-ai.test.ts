import { afterAll, describe, expect, it, vi } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { db, closeDb } from '@/server/db';
import * as schema from '@/server/db/schema';
import type { Actor } from '@/server/permissions';
import {
  resetSetupOnboardingState,
  createAdminUser,
  readSetupProgress,
  startOpenRouterFixture,
  OPENROUTER_FIXTURE_KEY,
} from '../../../test/setup-onboarding-fixtures';

vi.hoisted(() => {
  process.env.AI_PROVIDER_CONNECT_TIMEOUT_MS = '150';
});

import * as setupAi from '@/server/services/setup-ai';
import { getAiSettings } from '@/server/services/ai-actions';
import { decryptAiJson } from '@/server/crypto/ai-encryption';

const adminActor = (userId: string): Actor => ({ kind: 'user', userId, role: 'admin' });

afterAll(async () => {
  await resetSetupOnboardingState();
  await closeDb();
});

async function openSetupAtAiStep(): Promise<{ userId: string; actor: Actor }> {
  await resetSetupOnboardingState();
  const { userId } = await createAdminUser();
  await db.insert(schema.setupProgress).values({
    id: 'default',
    adminUserId: userId,
    accountStatus: 'created',
    currentStep: 'ai',
  });
  return { userId, actor: adminActor(userId) };
}

const CAPABILITY_BY_TYPE = { chat: 'text_generation', embedding: 'embedding', image: 'image_generation' } as const;

/** Simulates a completed background model sync with proven capabilities. */
async function completeSyncWithModels(options: {
  skipTypes?: Array<'chat' | 'embedding' | 'image'>;
  extraModels?: Partial<Record<'chat' | 'embedding' | 'image', Array<{
    externalId: string;
    displayName: string;
    embeddingDimensions?: number | null;
  }>>>;
} = {}) {
  const providers = await db.select().from(schema.aiProviders);
  for (const provider of providers) {
    const type = provider.type as 'chat' | 'embedding' | 'image';
    if (!options.skipTypes?.includes(type)) {
      const base = {
        externalId: `fixture/${type}`,
        displayName: `Fixture ${type === 'chat' ? 'Chat' : type === 'embedding' ? 'Embedding' : 'Image'}`,
        embeddingDimensions: type === 'embedding' ? 3 : null,
      };
      for (const modelDef of [base, ...(options.extraModels?.[type] ?? [])]) {
        const [model] = await db
          .insert(schema.aiModels)
          .values({
            providerId: provider.id,
            externalId: modelDef.externalId,
            displayName: modelDef.displayName,
            availability: 'available',
            embeddingDimensions:
              modelDef.embeddingDimensions !== undefined
                ? modelDef.embeddingDimensions
                : type === 'embedding'
                  ? 3
                  : null,
            inputModalities: ['text'],
            outputModalities: type === 'image' ? ['image'] : type === 'embedding' ? ['embeddings'] : ['text'],
            rawMetadata: {},
          })
          .returning();
        await db.insert(schema.aiModelCapabilities).values({
          modelId: model!.id,
          capability: CAPABILITY_BY_TYPE[type],
          supported: true,
          source: 'provider',
          details: {},
        });
      }
    }
  }
  await db
    .update(schema.aiActions)
    .set({ status: 'completed', finishedAt: new Date() })
    .where(eq(schema.aiActions.feature, 'model_sync'));
}

describe('setup-ai skip mode (US2)', () => {
  it('skips AI with no outbound calls and no AI rows', async () => {
    const fixture = await startOpenRouterFixture();
    try {
      const { actor } = await openSetupAtAiStep();
      const result = await setupAi.skipAiBootstrap(actor);
      expect(result.status).toBe('skipped');
      expect(result.nextStep).toBe('writing_mode');

      expect(fixture.requests).toHaveLength(0);
      expect(await db.select().from(schema.aiProviders)).toHaveLength(0);
      expect(await db.select().from(schema.aiActions)).toHaveLength(0);
      expect((await getAiSettings()).enabled).toBe(false);

      const progress = await readSetupProgress();
      expect(progress?.aiStatus).toBe('skipped');
      expect(progress?.currentStep).toBe('writing_mode');
      expect(progress?.aiResult).toMatchObject({
        wiki_text: { status: 'skipped' },
        wiki_embedding: { status: 'skipped' },
        wiki_image: { status: 'skipped' },
      });
    } finally {
      await fixture.close();
    }
  });

  it('requires the setup admin', async () => {
    await expect(setupAi.skipAiBootstrap({ kind: 'anonymous' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});

describe('setup-ai OpenRouter bootstrap (US2)', () => {
  it('validates credentials, registers providers, and queues model sync', async () => {
    const fixture = await startOpenRouterFixture();
    try {
      const { actor } = await openSetupAtAiStep();
      const result = await setupAi.configureAiBootstrap(actor, {
        apiKey: OPENROUTER_FIXTURE_KEY,
        baseUrl: fixture.baseUrl,
      });
      expect(result.status).toBe('queued');
      expect(result.actionId).toBeDefined();
      expect(result.pollUrl).toBe('/api/setup');

      const providers = await db.select().from(schema.aiProviders);
      expect(providers).toHaveLength(3);
      expect(providers.map((p) => p.type).sort()).toEqual(['chat', 'embedding', 'image']);
      for (const provider of providers) {
        expect(provider.vendor).toBe('openrouter');
        expect(provider.credentialsEncrypted).toBeTruthy();
        expect(provider.credentialsEncrypted).not.toContain(OPENROUTER_FIXTURE_KEY);
      }

      const settings = await getAiSettings();
      expect(settings.enabled).toBe(true);
      expect(settings.modelDetectorApiKeyEncrypted).toBeTruthy();
      expect(settings.modelDetectorApiKeyEncrypted).not.toContain(OPENROUTER_FIXTURE_KEY);
      expect(decryptAiJson<{ apiKey: string }>(settings.modelDetectorApiKeyEncrypted!).apiKey).toBe(OPENROUTER_FIXTURE_KEY);

      const actions = await db.select().from(schema.aiActions).where(eq(schema.aiActions.feature, 'model_sync'));
      expect(actions).toHaveLength(3);
      for (const action of actions) {
        expect(JSON.stringify(action.requestMetadata)).not.toContain(OPENROUTER_FIXTURE_KEY);
        // The worker resolves the provider through the encrypted action input.
        const inputRow = await db.query.aiActionInputs.findFirst({
          where: eq(schema.aiActionInputs.actionId, action.id),
        });
        expect(inputRow).toBeDefined();
      }

      const progress = await readSetupProgress();
      expect(progress?.aiStatus).toBe('queued');
      expect(progress?.aiActionId).toBe(result.actionId);
      expect(JSON.stringify(progress)).not.toContain(OPENROUTER_FIXTURE_KEY);
    } finally {
      await fixture.close();
    }
  });

  it('assigns detected models per purpose after sync completes', async () => {
    const { actor, userId } = await (async () => {
      const progress = await readSetupProgress();
      return { actor: adminActor(progress!.adminUserId!), userId: progress!.adminUserId! };
    })();
    await completeSyncWithModels();
    await setupAi.reconcileSetupAi(actor);

    const progress = await readSetupProgress();
    expect(progress?.aiStatus).toBe('completed');
    expect(progress?.currentStep).toBe('writing_mode');
    expect(progress?.aiResult).toMatchObject({
      wiki_text: { status: 'configured', modelName: 'Fixture Chat' },
      wiki_embedding: { status: 'configured', modelName: 'Fixture Embedding' },
      wiki_image: { status: 'configured', modelName: 'Fixture Image' },
    });

    const assignments = await db.select().from(schema.aiPurposeAssignments);
    expect(assignments.map((a) => a.purpose).sort()).toEqual(['wiki_embedding', 'wiki_image', 'wiki_text']);
    for (const assignment of assignments) {
      expect(assignment.updatedBy).toBe(userId);
    }
  });

  it('prefers free chat models and the Perplexity embedding model when present', async () => {
    const fixture = await startOpenRouterFixture();
    try {
      const { actor } = await openSetupAtAiStep();
      await setupAi.configureAiBootstrap(actor, { apiKey: OPENROUTER_FIXTURE_KEY, baseUrl: fixture.baseUrl });
      await completeSyncWithModels({
        extraModels: {
          chat: [{ externalId: 'fixture/text:free', displayName: 'Fixture Text Free' }],
          embedding: [
            { externalId: 'perplexity/pplx-embed-v1-0.6b', displayName: 'PPLX Embed v1 0.6B', embeddingDimensions: null },
          ],
        },
      });
      await setupAi.reconcileSetupAi(actor);

      const progress = await readSetupProgress();
      expect(progress?.aiStatus).toBe('completed');
      expect(progress?.aiResult).toMatchObject({
        wiki_text: { status: 'configured', modelName: 'Fixture Text Free' },
        wiki_embedding: { status: 'configured', modelName: 'PPLX Embed v1 0.6B' },
      });

      // The preferred embedding model received its known 1024 dimensions.
      const assignment = await db.query.aiPurposeAssignments.findFirst({
        where: eq(schema.aiPurposeAssignments.purpose, 'wiki_embedding'),
      });
      const model = await db.query.aiModels.findFirst({
        where: eq(schema.aiModels.id, assignment!.modelId),
      });
      expect(model?.externalId).toBe('perplexity/pplx-embed-v1-0.6b');
      expect(model?.embeddingDimensions).toBe(1024);
    } finally {
      await fixture.close();
    }
  });

  it('marks purposes without compatible models as unavailable (partial)', async () => {    const fixture = await startOpenRouterFixture();
    try {
      const { actor } = await openSetupAtAiStep();
      await setupAi.configureAiBootstrap(actor, { apiKey: OPENROUTER_FIXTURE_KEY, baseUrl: fixture.baseUrl });
      await completeSyncWithModels({ skipTypes: ['image'] });
      await setupAi.reconcileSetupAi(actor);

      const progress = await readSetupProgress();
      expect(progress?.aiStatus).toBe('partial');
      expect(progress?.currentStep).toBe('writing_mode');
      expect(progress?.aiResult).toMatchObject({
        wiki_text: { status: 'configured' },
        wiki_embedding: { status: 'configured' },
        wiki_image: { status: 'unavailable', reason: 'No compatible detected model' },
      });
    } finally {
      await fixture.close();
    }
  });

  it('reuses existing providers without overwriting them', async () => {
    const fixture = await startOpenRouterFixture();
    try {
      const { actor } = await openSetupAtAiStep();
      await setupAi.configureAiBootstrap(actor, { apiKey: OPENROUTER_FIXTURE_KEY, baseUrl: fixture.baseUrl });
      const firstProviders = await db.select().from(schema.aiProviders);
      await completeSyncWithModels();
      await setupAi.reconcileSetupAi(actor);

      // Repeated configure after completion returns the stored outcome and
      // must not duplicate providers or actions.
      const again = await setupAi.configureAiBootstrap(actor, { apiKey: OPENROUTER_FIXTURE_KEY, baseUrl: fixture.baseUrl });
      expect(again.status).toBe('completed');
      expect(await db.select().from(schema.aiProviders)).toHaveLength(firstProviders.length);
    } finally {
      await fixture.close();
    }
  });
});

describe('setup-ai OpenRouter failures (US2)', () => {
  it('rejects invalid keys with PROVIDER_AUTH_FAILED and persists nothing', async () => {
    const fixture = await startOpenRouterFixture();
    try {
      const { actor } = await openSetupAtAiStep();
      await expect(
        setupAi.configureAiBootstrap(actor, { apiKey: 'wrong-key', baseUrl: fixture.baseUrl }),
      ).rejects.toMatchObject({ code: 'PROVIDER_AUTH_FAILED' });

      expect(await db.select().from(schema.aiProviders)).toHaveLength(0);
      // The validation attempt is audited as a terminal provider_test action
      // (canonical behavior) — it must not contain the rejected key.
      const actions = await db.select().from(schema.aiActions);
      expect(actions).toHaveLength(1);
      expect(actions[0]!.feature).toBe('provider_test');
      expect(actions[0]!.status).toBe('failed');
      expect(JSON.stringify(actions[0])).not.toContain('wrong-key');
      expect(await db.select().from(schema.aiActions).where(eq(schema.aiActions.feature, 'model_sync'))).toHaveLength(0);
      const progress = await readSetupProgress();
      expect(progress?.aiStatus).toBe('not_started');
      expect(progress?.currentStep).toBe('ai');
    } finally {
      await fixture.close();
    }
  });

  it('maps provider rate limits to RATE_LIMITED', async () => {
    const fixture = await startOpenRouterFixture({ rateLimited: true });
    try {
      const { actor } = await openSetupAtAiStep();
      await expect(
        setupAi.configureAiBootstrap(actor, { apiKey: OPENROUTER_FIXTURE_KEY, baseUrl: fixture.baseUrl }),
      ).rejects.toMatchObject({ code: 'RATE_LIMITED' });
    } finally {
      await fixture.close();
    }
  });

  it('maps validation timeouts to TIMEOUT', async () => {
    const fixture = await startOpenRouterFixture({ delayMs: 500 });
    try {
      const { actor } = await openSetupAtAiStep();
      await expect(
        setupAi.configureAiBootstrap(actor, { apiKey: OPENROUTER_FIXTURE_KEY, baseUrl: fixture.baseUrl }),
      ).rejects.toMatchObject({ code: 'TIMEOUT' });
    } finally {
      await fixture.close();
    }
  });

  it('refuses to re-enable AI when an admin disabled it globally', async () => {
    const fixture = await startOpenRouterFixture();
    try {
      const { actor, userId } = await openSetupAtAiStep();
      await db.insert(schema.aiSettings).values({ id: 'default', enabled: false, updatedBy: userId });
      await db.insert(schema.aiProviders).values({
        name: 'Existing Provider',
        type: 'chat',
        vendor: 'custom',
        kind: 'openai_compatible',
        baseUrl: 'https://example.com/v1',
        credentialsEncrypted: 'enc',
      });
      await expect(
        setupAi.configureAiBootstrap(actor, { apiKey: OPENROUTER_FIXTURE_KEY, baseUrl: fixture.baseUrl }),
      ).rejects.toMatchObject({ code: 'AI_DISABLED' });
    } finally {
      await fixture.close();
    }
  });

  it('retries after failure without duplicating side effects', async () => {
    const badFixture = await startOpenRouterFixture();
    const goodFixture = await startOpenRouterFixture();
    try {
      const { actor } = await openSetupAtAiStep();
      await expect(
        setupAi.configureAiBootstrap(actor, { apiKey: 'wrong-key', baseUrl: badFixture.baseUrl }),
      ).rejects.toMatchObject({ code: 'PROVIDER_AUTH_FAILED' });

      const result = await setupAi.configureAiBootstrap(actor, {
        apiKey: OPENROUTER_FIXTURE_KEY,
        baseUrl: goodFixture.baseUrl,
      });
      expect(result.status).toBe('queued');
      expect(await db.select().from(schema.aiProviders)).toHaveLength(3);

      // Duplicate submit while queued returns the same state without new actions.
      const duplicate = await setupAi.configureAiBootstrap(actor, {
        apiKey: OPENROUTER_FIXTURE_KEY,
        baseUrl: goodFixture.baseUrl,
      });
      expect(duplicate.status).toBe('queued');
      expect(duplicate.actionId).toBe(result.actionId);
      // No new model sync actions: only the original three.
      expect(await db.select().from(schema.aiActions).where(eq(schema.aiActions.feature, 'model_sync'))).toHaveLength(3);
    } finally {
      await badFixture.close();
      await goodFixture.close();
    }
  });

  it('marks failed syncs as retryable failures with sanitized reasons', async () => {
    const fixture = await startOpenRouterFixture();
    try {
      const { actor } = await openSetupAtAiStep();
      await setupAi.configureAiBootstrap(actor, { apiKey: OPENROUTER_FIXTURE_KEY, baseUrl: fixture.baseUrl });
      await db
        .update(schema.aiActions)
        .set({ status: 'failed', errorMessage: 'AI provider rejected the credentials', finishedAt: new Date() })
        .where(eq(schema.aiActions.feature, 'model_sync'));
      await setupAi.reconcileSetupAi(actor);

      const progress = await readSetupProgress();
      expect(progress?.aiStatus).toBe('failed');
      expect(progress?.currentStep).toBe('ai');
      expect(progress?.aiResult).toMatchObject({
        wiki_text: { status: 'failed', reason: 'AI provider rejected the credentials' },
      });
      expect(JSON.stringify(progress)).not.toContain(OPENROUTER_FIXTURE_KEY);

      // Retry from failed works.
      const retry = await setupAi.configureAiBootstrap(actor, { apiKey: OPENROUTER_FIXTURE_KEY, baseUrl: fixture.baseUrl });
      expect(retry.status).toBe('queued');
    } finally {
      await fixture.close();
    }
  });

  it('keeps expired queued actions from blocking forever', async () => {
    const fixture = await startOpenRouterFixture();
    try {
      const { actor } = await openSetupAtAiStep();
      await setupAi.configureAiBootstrap(actor, { apiKey: OPENROUTER_FIXTURE_KEY, baseUrl: fixture.baseUrl });
      await db
        .update(schema.aiActions)
        .set({ expiresAt: new Date(Date.now() - 1000) })
        .where(and(eq(schema.aiActions.feature, 'model_sync'), eq(schema.aiActions.status, 'queued')));
      await db
        .update(schema.aiActions)
        .set({ status: 'expired', finishedAt: new Date() })
        .where(eq(schema.aiActions.feature, 'model_sync'));
      await setupAi.reconcileSetupAi(actor);
      const progress = await readSetupProgress();
      expect(progress?.aiStatus).toBe('failed');
      expect(progress?.aiResult).toMatchObject({
        wiki_text: { status: 'failed', reason: 'Model sync expired before completion' },
      });
    } finally {
      await fixture.close();
    }
  });
});
