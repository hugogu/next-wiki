import { and, desc, eq, inArray } from 'drizzle-orm';
import type {
  AiProviderType,
  SetupAiBootstrapResponse,
  SetupAiResult,
  SetupPurposeResult,
} from '@next-wiki/shared';
import { getAiProviderVendor } from '@next-wiki/shared';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { env } from '@/server/config';
import { DomainError } from '@/server/errors';
import type { Actor, PermCtx } from '@/server/permissions';
import * as aiAdmin from '@/server/services/ai-admin';
import { createAction, getAiSettings } from '@/server/services/ai-actions';
import {
  assertSetupAdmin,
  getSetupProgress,
  recordAiQueued,
  recordAiSkip,
  recordAiTerminal,
  type SetupProgressRow,
} from '@/server/services/setup';

const PURPOSE_BY_PROVIDER_TYPE: Record<AiProviderType, 'wiki_text' | 'wiki_embedding' | 'wiki_image'> = {
  chat: 'wiki_text',
  embedding: 'wiki_embedding',
  image: 'wiki_image',
};

const OPENROUTER_PROVIDER_NAMES: Record<AiProviderType, string> = {
  chat: 'OpenRouter Chat',
  embedding: 'OpenRouter Embedding',
  image: 'OpenRouter Image',
};

function asCtx(actor: Actor): PermCtx {
  return { actor };
}

/**
 * Skip AI setup. Makes no outbound provider, detector, embedding, chat, or
 * image-generation calls; just records the explicit choice.
 */
export async function skipAiBootstrap(actor: Actor): Promise<SetupAiBootstrapResponse> {
  await assertSetupAdmin(actor);
  await recordAiSkip();
  const progress = await getSetupProgress();
  return {
    status: 'skipped',
    purposes: (progress?.aiResult as SetupAiResult | null) ?? undefined,
    nextStep: 'sample_pages',
  };
}

/**
 * Configure OpenRouter AI bootstrap: validate the key inline (one bounded
 * call), persist it encrypted as the detector key, register/reuse one provider
 * per capability, and queue model sync through the normal AI action pipeline.
 * The key is never stored in setup progress, action metadata, logs, or
 * responses.
 */
export async function configureAiBootstrap(
  actor: Actor,
  input: { apiKey: string; autoAssign?: boolean; baseUrl?: string },
): Promise<SetupAiBootstrapResponse> {
  const progress = await assertSetupAdmin(actor);
  const ctx = asCtx(actor);

  // Repeated submits while a bootstrap is in flight return the same state
  // instead of duplicating side effects.
  if (progress.aiStatus === 'queued' || progress.aiStatus === 'running') {
    return {
      status: 'queued',
      actionId: progress.aiActionId ?? undefined,
      pollUrl: '/api/setup',
    };
  }
  if (progress.aiStatus === 'completed' || progress.aiStatus === 'partial') {
    return {
      status: progress.aiStatus,
      purposes: (progress.aiResult as SetupAiResult | null) ?? undefined,
      nextStep: 'sample_pages',
    };
  }

  // Respect a deliberate admin AI shutdown: AI was configured before and then
  // disabled globally, so onboarding must not silently re-enable it.
  const settings = await getAiSettings();
  if (!settings.enabled) {
    const existingProviders = await db
      .select({ id: schema.aiProviders.id })
      .from(schema.aiProviders)
      .limit(1);
    if (existingProviders.length > 0) {
      throw new DomainError('AI_DISABLED', 'AI is disabled by administrator policy');
    }
  }

  // Validate the key against OpenRouter before persisting anything.
  const baseUrl = input.baseUrl ?? env.OPENROUTER_BASE_URL;
  const health = await aiAdmin.testProviderConnection(ctx, {
    mode: 'draft',
    type: 'chat',
    vendor: 'openrouter',
    baseUrl,
    credentials: { apiKey: input.apiKey },
  });
  if (!health.ok) {
    if (health.errorCode === 'RATE_LIMITED') {
      throw new DomainError('RATE_LIMITED', 'OpenRouter rate limit exceeded; retry shortly');
    }
    if (health.errorCode === 'TIMEOUT') {
      throw new DomainError('TIMEOUT', 'OpenRouter validation timed out; retry');
    }
    throw new DomainError('PROVIDER_AUTH_FAILED', 'OpenRouter credentials could not be validated');
  }

  const autoAssign = input.autoAssign ?? true;

  // Persist the detector key (encrypted) and enable AI. Provider registration
  // is done explicitly below so model sync runs through the background action
  // pipeline instead of inline in this request.
  await aiAdmin.updateSettings(ctx, { enabled: true, modelDetectorApiKey: input.apiKey });

  const definition = getAiProviderVendor('openrouter');
  let lastActionId: string | null = null;
  for (const type of definition.capabilities) {
    const providerId = await ensureOpenRouterProvider(ctx, type, input.apiKey, baseUrl);
    if (!providerId) continue;
    const action = await createAction(ctx, {
      feature: 'model_sync',
      input: { providerId },
      providerId,
      requestMetadata: { providerId, origin: 'setup_bootstrap', autoAssign },
    });
    lastActionId = action.id;
  }
  if (!lastActionId) {
    throw new DomainError('PROVIDER_UNAVAILABLE', 'OpenRouter providers could not be registered');
  }

  await recordAiQueued(lastActionId);
  return { status: 'queued', actionId: lastActionId, pollUrl: '/api/setup' };
}

async function ensureOpenRouterProvider(
  ctx: PermCtx,
  type: AiProviderType,
  apiKey: string,
  baseUrl?: string,
): Promise<string | null> {
  const name = OPENROUTER_PROVIDER_NAMES[type];
  const definition = getAiProviderVendor('openrouter');
  const resolvedBaseUrl = baseUrl ?? definition.baseUrls[type];
  if (!resolvedBaseUrl) return null;
  try {
    const provider = await aiAdmin.createProvider(ctx, {
      name,
      type,
      vendor: 'openrouter',
      baseUrl: resolvedBaseUrl,
      credentials: { apiKey },
    });
    return provider.id;
  } catch (error) {
    // Existing provider with this name is reused as-is, never overwritten.
    if (error instanceof DomainError && error.code === 'CONFLICT') {
      const existing = await db.query.aiProviders.findFirst({
        where: eq(schema.aiProviders.name, name),
      });
      return existing?.id ?? null;
    }
    throw error;
  }
}

type SyncActionRow = typeof schema.aiActions.$inferSelect;

function latestActionPerProvider(actions: SyncActionRow[]): Map<string, SyncActionRow> {
  const latest = new Map<string, SyncActionRow>();
  for (const action of actions) {
    if (!action.providerId) continue;
    if (!latest.has(action.providerId)) latest.set(action.providerId, action);
  }
  return latest;
}

function isActionActive(action: SyncActionRow, now: Date): boolean {
  if (action.status !== 'queued' && action.status !== 'running') return false;
  return action.expiresAt > now;
}

/**
 * Reconciles a queued/running AI bootstrap against the model-sync action
 * records. When every sync is terminal, computes the per-purpose outcome
 * (auto-assigning detected models when requested) and advances setup. Safe to
 * call on every setup-state read; only acts while bootstrap is in flight.
 */
export async function reconcileSetupAi(actor: Actor): Promise<void> {
  if (actor.kind !== 'user' || actor.role !== 'admin') return;
  const progress = await getSetupProgress();
  if (!progress || (progress.aiStatus !== 'queued' && progress.aiStatus !== 'running')) return;

  const providers = await db
    .select()
    .from(schema.aiProviders)
    .where(eq(schema.aiProviders.vendor, 'openrouter'));
  if (providers.length === 0) {
    await recordAiTerminal({
      status: 'failed',
      result: {
        wiki_text: { status: 'failed', reason: 'OpenRouter providers were removed' },
        wiki_embedding: { status: 'failed', reason: 'OpenRouter providers were removed' },
        wiki_image: { status: 'failed', reason: 'OpenRouter providers were removed' },
      },
    });
    return;
  }

  const actions = await db
    .select()
    .from(schema.aiActions)
    .where(
      and(
        eq(schema.aiActions.feature, 'model_sync'),
        inArray(
          schema.aiActions.providerId,
          providers.map((provider) => provider.id),
        ),
      ),
    )
    .orderBy(desc(schema.aiActions.queuedAt));

  const now = new Date();
  const active = actions.filter((action) => isActionActive(action, now));
  if (active.length > 0) {
    // Reflect progress while syncs run; no terminal transition yet.
    const anyRunning = active.some((action) => action.status === 'running');
    const nextStatus = anyRunning ? 'running' : 'queued';
    if (progress.aiStatus !== nextStatus) {
      await db
        .update(schema.setupProgress)
        .set({ aiStatus: nextStatus, updatedAt: now })
        .where(eq(schema.setupProgress.id, progress.id));
    }
    return;
  }

  const latestByProvider = latestActionPerProvider(actions);
  const autoAssign = await readAutoAssignFlag(progress);
  const ctx = asCtx(actor);

  const providerByType = new Map(providers.map((provider) => [provider.type, provider]));
  const result: SetupAiResult = {};
  for (const type of getAiProviderVendor('openrouter').capabilities) {
    const purpose = PURPOSE_BY_PROVIDER_TYPE[type];
    const provider = providerByType.get(type);
    if (!provider) {
      result[purpose] = { status: 'needs_manual_setup', reason: 'OpenRouter provider is not registered' };
      continue;
    }
    const syncAction = latestByProvider.get(provider.id);
    if (!syncAction) {
      result[purpose] = { status: 'needs_manual_setup', reason: 'Model sync did not run' };
      continue;
    }
    if (syncAction.status !== 'completed') {
      const reason =
        syncAction.status === 'expired'
          ? 'Model sync expired before completion'
          : (syncAction.errorMessage ?? 'Model sync failed');
      result[purpose] = { status: 'failed', reason };
      continue;
    }
    result[purpose] = autoAssign
      ? await assignBestModel(ctx, purpose, provider.id)
      : { status: 'needs_manual_setup', reason: 'Automatic assignment was disabled' };
  }

  const outcomes = Object.values(result);
  const configured = outcomes.filter((outcome) => outcome.status === 'configured').length;
  const failed = outcomes.filter((outcome) => outcome.status === 'failed').length;
  const status =
    configured === outcomes.length && outcomes.length > 0
      ? 'completed'
      : configured > 0 || failed === 0
        ? 'partial'
        : 'failed';
  await recordAiTerminal({ status, result });
}

async function readAutoAssignFlag(progress: SetupProgressRow): Promise<boolean> {
  if (!progress.aiActionId) return true;
  const action = await db.query.aiActions.findFirst({
    where: eq(schema.aiActions.id, progress.aiActionId),
  });
  const metadata = action?.requestMetadata as { autoAssign?: unknown } | null;
  return metadata?.autoAssign !== false;
}

async function assignBestModel(
  ctx: PermCtx,
  purpose: 'wiki_text' | 'wiki_embedding' | 'wiki_image',
  providerId: string,
): Promise<SetupPurposeResult> {
  const candidates = await db
    .select()
    .from(schema.aiModels)
    .where(
      and(
        eq(schema.aiModels.providerId, providerId),
        eq(schema.aiModels.availability, 'available'),
      ),
    )
    .orderBy(schema.aiModels.displayName);
  if (candidates.length === 0) {
    return { status: 'unavailable', reason: 'No compatible detected model' };
  }
  let lastReason = 'Capability evidence is missing or ambiguous';
  for (const model of candidates) {
    try {
      await aiAdmin.assignPurpose(ctx, purpose, model.id);
      return { status: 'configured', modelId: model.id, modelName: model.displayName };
    } catch (error) {
      if (error instanceof DomainError) {
        lastReason = error.message;
        continue;
      }
      throw error;
    }
  }
  return { status: 'needs_manual_setup', reason: lastReason };
}
