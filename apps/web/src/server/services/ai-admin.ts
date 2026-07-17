import { and, asc, eq, inArray, notInArray, or } from 'drizzle-orm';
import {
  aiModelDetectorConfigSchema,
  getAiProviderVendor,
  readModelDetectorConfig,
  type AiCapability,
  type AiModelCreate,
  type AiModelDetectorConfig,
  type AiModelSyncResult,
  type AiModelView,
  type AiProviderCreate,
  type AiProviderKind,
  type AiProviderTest,
  type AiProviderType,
  type AiProviderUpdate,
  type AiProviderVendor,
  type AiProviderView,
  type AiPurpose,
  type AiSettingsUpdate,
} from '@next-wiki/shared';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { env } from '@/server/config';
import { can, getActorUserId, type PermCtx } from '@/server/permissions';
import { DomainError } from '@/server/errors';
import { decryptAiJson, encryptAiJson } from '@/server/crypto/ai-encryption';
import { createAction, getAiSettings, recordTerminalAction } from './ai-actions';
import { createAiProviderAdapter, createModelDiscoveryAdapter } from '@/server/ai/registry';
import { detectCapabilities, listEmbeddingModels } from '@/server/ai/model-detector';
import { createDetector } from '@/server/ai/model-detectors/registry';
import {
  DetectorError,
  normalizeDetectorError,
  type DetectedModel,
  type DetectorRuntimeConfig,
} from '@/server/ai/model-detectors/types';
import {
  normalizeProviderError,
  type DiscoveredModel,
  type ProviderHealth,
  type ProviderCredentials,
  type ProviderRuntimeConfig,
} from '@/server/ai/types';

type ProviderRow = typeof schema.aiProviders.$inferSelect;

export function assertCanManageAi(ctx: PermCtx): void {
  if (ctx.actor.kind !== 'user' || !can(ctx, 'manage_ai', { kind: 'ai_settings' })) {
    throw new DomainError('FORBIDDEN', 'You do not have permission to manage AI');
  }
}

function actorId(ctx: PermCtx): string {
  const id = getActorUserId(ctx);
  if (!id) throw new DomainError('UNAUTHORIZED', 'Sign in to manage AI');
  return id;
}

function validateBaseUrl(value: string): string {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new DomainError('BAD_REQUEST', 'Provider base URL is invalid');
  }
  return url.toString().replace(/\/$/, '');
}

/**
 * Validate a provider's `modelDetector` config up front so a misconfigured
 * detector is rejected at create/update time rather than only at sync. A
 * Cloudflare detector requires a provider credential (its API token); the
 * token is supplied on create, or must already exist on update.
 */
function validateDetectorConfig(
  config: Record<string, unknown> | undefined,
  credentials: ProviderCredentials | undefined,
  hasStoredCredentials: boolean,
): void {
  const raw = (config ?? {})['modelDetector'];
  if (raw === undefined) return;
  const parsed = aiModelDetectorConfigSchema.safeParse(raw);
  if (!parsed.success) {
    throw new DomainError('BAD_REQUEST', 'Model detector configuration is invalid');
  }
  if (parsed.data.source === 'cloudflare') {
    const hasCredential = Boolean(credentials?.apiKey) || (credentials === undefined && hasStoredCredentials);
    if (!hasCredential) {
      throw new DomainError('BAD_REQUEST', 'Cloudflare detector requires an API token credential');
    }
  }
}

function resolveProviderProtocol(
  type: AiProviderType,
  vendor: AiProviderCreate['vendor'],
  requested?: AiProviderKind,
): AiProviderKind {
  const definition = getAiProviderVendor(vendor);
  if (!definition.capabilities.includes(type)) {
    throw new DomainError('BAD_REQUEST', 'Vendor does not support this AI capability');
  }
  const protocol = definition.protocols[type];
  if (!protocol) throw new DomainError('BAD_REQUEST', 'Vendor protocol is not configured');
  if (vendor === 'custom' && requested) return requested;
  return protocol;
}

function providerView(row: ProviderRow): AiProviderView {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    vendor: row.vendor,
    kind: row.kind,
    baseUrl: row.baseUrl,
    config: row.config as Record<string, unknown>,
    hasCredentials: Boolean(row.credentialsEncrypted),
    enabled: row.enabled,
    status: row.enabled ? row.status : 'disabled',
    lastCheckedAt: row.lastCheckedAt?.toISOString() ?? null,
    lastErrorCode: row.lastErrorCode,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function readSettings(ctx: PermCtx) {
  assertCanManageAi(ctx);
  const settings = await getAiSettings();
  const assignments = await db
    .select({
      purpose: schema.aiPurposeAssignments.purpose,
      modelId: schema.aiPurposeAssignments.modelId,
      modelName: schema.aiModels.displayName,
      providerId: schema.aiProviders.id,
      providerName: schema.aiProviders.name,
    })
    .from(schema.aiPurposeAssignments)
    .innerJoin(schema.aiModels, eq(schema.aiPurposeAssignments.modelId, schema.aiModels.id))
    .innerJoin(schema.aiProviders, eq(schema.aiModels.providerId, schema.aiProviders.id));
  return {
    enabled: settings.enabled,
    eventRetentionHours: settings.eventRetentionHours,
    artifactRetentionHours: settings.artifactRetentionHours,
    hasModelDetectorApiKey: Boolean(settings.modelDetectorApiKeyEncrypted),
    assignments,
  };
}

export async function updateSettings(ctx: PermCtx, input: AiSettingsUpdate) {
  assertCanManageAi(ctx);
  const values = {
    ...(input.modelDetectorApiKey
      ? { modelDetectorApiKeyEncrypted: encryptAiJson({ apiKey: input.modelDetectorApiKey }) }
      : {}),
    ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
    ...(input.eventRetentionHours !== undefined ? { eventRetentionHours: input.eventRetentionHours } : {}),
    ...(input.artifactRetentionHours !== undefined ? { artifactRetentionHours: input.artifactRetentionHours } : {}),
    updatedBy: actorId(ctx),
    updatedAt: new Date(),
  };
  const [row] = await db
    .insert(schema.aiSettings)
    .values({ id: 'default', ...values })
    .onConflictDoUpdate({ target: schema.aiSettings.id, set: values })
    .returning();
  // The detector key is an OpenRouter key, so it can double as the credential
  // for a full set of OpenRouter providers when the admin opts in.
  if (input.registerOpenRouterProviders && input.modelDetectorApiKey) {
    await registerOpenRouterProviders(ctx, input.modelDetectorApiKey);
  }
  return row!;
}

// OpenRouter exposes every capability behind one key, but provider names are
// globally unique, so each capability gets its own distinctly-named provider.
const OPENROUTER_PROVIDER_NAMES: Record<AiProviderType, string> = {
  chat: 'OpenRouter Chat',
  embedding: 'OpenRouter Embedding',
  image: 'OpenRouter Image',
};

/**
 * Register (or reuse) one OpenRouter provider per capability using the shared
 * detector key, then best-effort sync each so their model catalogs populate
 * immediately. Existing providers whose name already exists are left untouched.
 */
export async function registerOpenRouterProviders(
  ctx: PermCtx,
  apiKey: string,
): Promise<string[]> {
  assertCanManageAi(ctx);
  const definition = getAiProviderVendor('openrouter');
  const created: string[] = [];
  for (const type of definition.capabilities) {
    const baseUrl = definition.baseUrls[type];
    if (!baseUrl) continue;
    let provider: AiProviderView;
    try {
      provider = await createProvider(ctx, {
        name: OPENROUTER_PROVIDER_NAMES[type],
        type,
        vendor: 'openrouter',
        baseUrl,
        credentials: { apiKey },
      });
    } catch (error) {
      // A provider with this name already exists — leave it as configured.
      if (error instanceof DomainError && error.code === 'CONFLICT') continue;
      throw error;
    }
    created.push(provider.id);
    await syncProviderModels(provider.id).catch(() => undefined);
  }
  return created;
}

export async function listProviders(ctx: PermCtx): Promise<AiProviderView[]> {
  assertCanManageAi(ctx);
  return (await db.select().from(schema.aiProviders).orderBy(asc(schema.aiProviders.name))).map(providerView);
}

export async function getProvider(ctx: PermCtx, id: string): Promise<AiProviderView> {
  assertCanManageAi(ctx);
  const row = await db.query.aiProviders.findFirst({ where: eq(schema.aiProviders.id, id) });
  if (!row) throw new DomainError('NOT_FOUND', 'AI provider not found');
  return providerView(row);
}

export async function createProvider(
  ctx: PermCtx,
  input: Omit<AiProviderCreate, 'config' | 'enabled' | 'type'> & {
    type?: AiProviderCreate['type'];
    config?: Record<string, unknown>;
    enabled?: boolean;
  },
): Promise<AiProviderView> {
  assertCanManageAi(ctx);
  const userId = actorId(ctx);
  const type = input.type ?? 'chat';
  const kind = resolveProviderProtocol(type, input.vendor, input.kind);
  validateDetectorConfig(input.config, input.credentials, false);
  try {
    const [row] = await db
      .insert(schema.aiProviders)
      .values({
        name: input.name,
        type,
        vendor: input.vendor,
        kind,
        baseUrl: validateBaseUrl(input.baseUrl),
        config: input.config ?? {},
        credentialsEncrypted: encryptAiJson(input.credentials),
        enabled: input.enabled ?? true,
        status: input.enabled === false ? 'disabled' : 'unverified',
        createdBy: userId,
        updatedBy: userId,
      })
      .returning();
    return providerView(row!);
  } catch (error) {
    if (String(error).includes('ai_providers_name_unique')) {
      throw new DomainError('CONFLICT', 'An AI provider with this name already exists');
    }
    throw error;
  }
}

export async function updateProvider(
  ctx: PermCtx,
  id: string,
  input: AiProviderUpdate,
): Promise<AiProviderView> {
  assertCanManageAi(ctx);
  const current = await db.query.aiProviders.findFirst({ where: eq(schema.aiProviders.id, id) });
  if (!current) throw new DomainError('NOT_FOUND', 'AI provider not found');
  const type = input.type ?? current.type;
  const vendor = input.vendor ?? current.vendor;
  const kind = resolveProviderProtocol(type, vendor, input.kind);
  if (input.config !== undefined) {
    validateDetectorConfig(input.config, input.credentials, Boolean(current.credentialsEncrypted));
  }
  const [row] = await db
    .update(schema.aiProviders)
    .set({
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.type !== undefined ? { type: input.type } : {}),
      ...(input.vendor !== undefined ? { vendor: input.vendor } : {}),
      ...(input.type !== undefined || input.vendor !== undefined || input.kind !== undefined
        ? { kind }
        : {}),
      ...(input.baseUrl !== undefined ? { baseUrl: validateBaseUrl(input.baseUrl) } : {}),
      ...(input.config !== undefined ? { config: input.config } : {}),
      ...(input.credentials !== undefined
        ? { credentialsEncrypted: encryptAiJson(input.credentials) }
        : {}),
      ...(input.enabled !== undefined
        ? { enabled: input.enabled, status: input.enabled ? 'unverified' : 'disabled' }
        : {}),
      updatedBy: actorId(ctx),
      updatedAt: new Date(),
    })
    .where(eq(schema.aiProviders.id, id))
    .returning();
  return providerView(row!);
}

export async function deleteProvider(ctx: PermCtx, id: string): Promise<void> {
  assertCanManageAi(ctx);
  const provider = await db.query.aiProviders.findFirst({ where: eq(schema.aiProviders.id, id) });
  if (!provider) throw new DomainError('NOT_FOUND', 'AI provider not found');
  const models = await db
    .select({ id: schema.aiModels.id })
    .from(schema.aiModels)
    .where(eq(schema.aiModels.providerId, id));
  const modelIds = models.map((model) => model.id);
  const generations = modelIds.length
    ? await db
        .select({ id: schema.aiIndexGenerations.id })
        .from(schema.aiIndexGenerations)
        .where(inArray(schema.aiIndexGenerations.modelId, modelIds))
    : [];
  const generationIds = generations.map((generation) => generation.id);
  const activeConditions = [eq(schema.aiActions.providerId, id)];
  if (modelIds.length) activeConditions.push(inArray(schema.aiActions.modelId, modelIds));
  if (generationIds.length) activeConditions.push(inArray(schema.aiActions.indexGenerationId, generationIds));
  const active = await db.query.aiActions.findFirst({
    where: and(
      inArray(schema.aiActions.status, ['queued', 'running']),
      or(...activeConditions),
    ),
  });
  if (active) throw new DomainError('PROVIDER_IN_USE', 'AI provider is in use');

  await db.transaction(async (tx) => {
    const actionConditions = [eq(schema.aiActions.providerId, id)];
    if (modelIds.length) actionConditions.push(inArray(schema.aiActions.modelId, modelIds));
    if (generationIds.length) actionConditions.push(inArray(schema.aiActions.indexGenerationId, generationIds));
    await tx.delete(schema.aiActions).where(or(...actionConditions));
    if (modelIds.length) {
      await tx.delete(schema.aiPurposeAssignments).where(inArray(schema.aiPurposeAssignments.modelId, modelIds));
    }
    if (generationIds.length) {
      await tx.delete(schema.aiIndexGenerations).where(inArray(schema.aiIndexGenerations.id, generationIds));
    }
    await tx.delete(schema.aiProviders).where(eq(schema.aiProviders.id, id));
  });
}

export async function createProviderAction(
  ctx: PermCtx,
  providerId: string,
  feature: 'provider_test' | 'model_sync',
) {
  assertCanManageAi(ctx);
  const provider = await db.query.aiProviders.findFirst({ where: eq(schema.aiProviders.id, providerId) });
  if (!provider) throw new DomainError('NOT_FOUND', 'AI provider not found');
  if (!provider.enabled) throw new DomainError('PROVIDER_DISABLED', 'AI provider is disabled');
  return createAction(ctx, {
    feature,
    input: { providerId },
    providerId,
    requestMetadata: { providerId },
  });
}

async function effectiveCapabilities(modelIds: string[]) {
  type CapabilityRow = typeof schema.aiModelCapabilities.$inferSelect;
  if (!modelIds.length) return new Map<string, Map<AiCapability, CapabilityRow>>();
  const rows = await db
    .select()
    .from(schema.aiModelCapabilities)
    .where(inArray(schema.aiModelCapabilities.modelId, modelIds));
  const result = new Map<string, Map<AiCapability, CapabilityRow>>();
  const priority = { manual: 3, provider: 2, catalog: 1 };
  for (const row of rows) {
    const byCapability = result.get(row.modelId) ?? new Map();
    const current = byCapability.get(row.capability);
    if (!current || priority[row.source] > priority[current.source as keyof typeof priority]) {
      byCapability.set(row.capability, row);
    }
    result.set(row.modelId, byCapability);
  }
  return result;
}

export async function listModels(ctx: PermCtx, providerId?: string): Promise<AiModelView[]> {
  assertCanManageAi(ctx);
  const rows = await db
    .select({
      model: schema.aiModels,
      providerName: schema.aiProviders.name,
      providerType: schema.aiProviders.type,
    })
    .from(schema.aiModels)
    .innerJoin(schema.aiProviders, eq(schema.aiModels.providerId, schema.aiProviders.id))
    .where(providerId ? eq(schema.aiModels.providerId, providerId) : undefined)
    .orderBy(asc(schema.aiProviders.name), asc(schema.aiModels.displayName));
  const capabilities = await effectiveCapabilities(rows.map(({ model }) => model.id));
  return rows.map(({ model, providerName, providerType }) => ({
    id: model.id,
    providerId: model.providerId,
    providerName,
    providerType,
    externalId: model.externalId,
    canonicalId: model.canonicalId,
    displayName: model.displayName,
    availability: model.availability,
    contextWindow: model.contextWindow,
    maxOutputTokens: model.maxOutputTokens,
    embeddingDimensions: model.embeddingDimensions,
    embeddingMultilingualSupport:
      typeof (model.rawMetadata as Record<string, unknown>).multilingualSupport === 'boolean'
        ? (model.rawMetadata as Record<string, unknown>).multilingualSupport as boolean
        : null,
    inputModalities: model.inputModalities,
    outputModalities: model.outputModalities,
    manuallyAdded: model.manuallyAdded,
    capabilities: [...(capabilities.get(model.id)?.values() ?? [])].map((row) => ({
      capability: row.capability,
      supported: row.supported,
      source: row.source,
      details: row.details as Record<string, unknown>,
    })),
    lastSeenAt: model.lastSeenAt?.toISOString() ?? null,
  }));
}

export async function createManualModel(
  ctx: PermCtx,
  providerId: string,
  input: AiModelCreate,
): Promise<AiModelView> {
  assertCanManageAi(ctx);
  const provider = await db.query.aiProviders.findFirst({ where: eq(schema.aiProviders.id, providerId) });
  if (!provider) throw new DomainError('NOT_FOUND', 'AI provider not found');
  const [model] = await db
    .insert(schema.aiModels)
    .values({
      providerId,
      externalId: input.externalId,
      displayName: input.displayName,
      contextWindow: input.contextWindow ?? null,
      maxOutputTokens: input.maxOutputTokens ?? null,
      embeddingDimensions: input.embeddingDimensions ?? null,
      manuallyAdded: true,
      availability: 'available',
    })
    .returning();
  const capability: AiCapability =
    provider.type === 'chat'
      ? 'text_generation'
      : provider.type === 'embedding'
        ? 'embedding'
        : 'image_generation';
  await db.insert(schema.aiModelCapabilities).values({
    modelId: model!.id,
    capability,
    supported: true,
    source: 'manual',
    details: { providerType: provider.type },
    updatedBy: actorId(ctx),
  });
  return (await listModels(ctx, providerId)).find((item) => item.id === model!.id)!;
}

export async function updateModel(
  ctx: PermCtx,
  modelId: string,
  input: {
    displayName?: string;
    contextWindow?: number | null;
    maxOutputTokens?: number | null;
    embeddingDimensions?: number | null;
  },
): Promise<AiModelView> {
  assertCanManageAi(ctx);
  const [row] = await db
    .update(schema.aiModels)
    .set({ ...input, updatedAt: new Date() })
    .where(eq(schema.aiModels.id, modelId))
    .returning();
  if (!row) throw new DomainError('MODEL_NOT_FOUND', 'AI model not found');
  return (await listModels(ctx, row.providerId)).find((item) => item.id === modelId)!;
}

export async function deleteModel(ctx: PermCtx, modelId: string): Promise<void> {
  assertCanManageAi(ctx);
  const assigned = await db.query.aiPurposeAssignments.findFirst({
    where: eq(schema.aiPurposeAssignments.modelId, modelId),
  });
  if (assigned) throw new DomainError('MODEL_IN_USE', 'AI model is assigned to a purpose');
  const index = await db.query.aiIndexGenerations.findFirst({
    where: eq(schema.aiIndexGenerations.modelId, modelId),
  });
  if (index) {
    throw new DomainError('MODEL_IN_USE', 'AI model is referenced by an index');
  }
  const deleted = await db.delete(schema.aiModels).where(eq(schema.aiModels.id, modelId)).returning();
  if (!deleted.length) throw new DomainError('MODEL_NOT_FOUND', 'AI model not found');
}

export async function setCapabilityOverride(
  ctx: PermCtx,
  modelId: string,
  capability: AiCapability,
  supported: boolean,
  details: Record<string, unknown>,
): Promise<void> {
  assertCanManageAi(ctx);
  await db
    .insert(schema.aiModelCapabilities)
    .values({ modelId, capability, supported, source: 'manual', details, updatedBy: actorId(ctx) })
    .onConflictDoUpdate({
      target: [
        schema.aiModelCapabilities.modelId,
        schema.aiModelCapabilities.capability,
        schema.aiModelCapabilities.source,
      ],
      set: { supported, details, updatedBy: actorId(ctx), updatedAt: new Date() },
    });
}

export async function removeCapabilityOverride(
  ctx: PermCtx,
  modelId: string,
  capability: AiCapability,
): Promise<void> {
  assertCanManageAi(ctx);
  await db.delete(schema.aiModelCapabilities).where(
    and(
      eq(schema.aiModelCapabilities.modelId, modelId),
      eq(schema.aiModelCapabilities.capability, capability),
      eq(schema.aiModelCapabilities.source, 'manual'),
    ),
  );
}

const purposeCapability: Record<AiPurpose, AiCapability> = {
  wiki_text: 'text_generation',
  wiki_embedding: 'embedding',
  wiki_image: 'image_generation',
};

export async function assignPurpose(
  ctx: PermCtx,
  purpose: AiPurpose,
  modelId: string,
  options: { confirmCapability?: boolean; embeddingDimensions?: number | null } = {},
) {
  assertCanManageAi(ctx);
  const model = await db
    .select({ model: schema.aiModels, provider: schema.aiProviders })
    .from(schema.aiModels)
    .innerJoin(schema.aiProviders, eq(schema.aiModels.providerId, schema.aiProviders.id))
    .where(eq(schema.aiModels.id, modelId))
    .limit(1);
  if (!model[0]) throw new DomainError('MODEL_NOT_FOUND', 'AI model not found');
  if (!model[0].provider.enabled) throw new DomainError('PROVIDER_DISABLED', 'AI provider is disabled');
  if (model[0].model.availability !== 'available') throw new DomainError('MODEL_UNAVAILABLE', 'AI model is unavailable');
  const expectedProviderType = {
    wiki_text: 'chat',
    wiki_embedding: 'embedding',
    wiki_image: 'image',
  } as const;
  if (model[0].provider.type !== expectedProviderType[purpose]) {
    throw new DomainError('CAPABILITY_MISMATCH', 'AI model belongs to the wrong provider type');
  }
  const embeddingDimensions =
    purpose === 'wiki_embedding'
      ? options.embeddingDimensions ?? model[0].model.embeddingDimensions
      : null;
  if (purpose === 'wiki_embedding' && !embeddingDimensions) {
    throw new DomainError('EMBEDDING_DIMENSIONS_REQUIRED', 'Embedding dimensions are required');
  }
  let capability = (await effectiveCapabilities([modelId])).get(modelId)?.get(purposeCapability[purpose]);
  if (!capability?.supported && options.confirmCapability) {
    await setCapabilityOverride(ctx, modelId, purposeCapability[purpose], true, {
      confirmedDuringPurposeAssignment: true,
    });
    capability = (await effectiveCapabilities([modelId])).get(modelId)?.get(purposeCapability[purpose]);
  }
  if (!capability?.supported) throw new DomainError('CAPABILITY_MISMATCH', 'AI model lacks the required capability');
  if (purpose === 'wiki_embedding' && embeddingDimensions !== model[0].model.embeddingDimensions) {
    await db
      .update(schema.aiModels)
      .set({ embeddingDimensions, updatedAt: new Date() })
      .where(eq(schema.aiModels.id, modelId));
  }
  const [row] = await db
    .insert(schema.aiPurposeAssignments)
    .values({ purpose, modelId, updatedBy: actorId(ctx) })
    .onConflictDoUpdate({
      target: schema.aiPurposeAssignments.purpose,
      set: { modelId, updatedBy: actorId(ctx), updatedAt: new Date() },
    })
    .returning();
  if (purpose === 'wiki_embedding') {
    const { createIndexRebuild } = await import('./ai-index');
    return {
      assignment: row!,
      ...(await createIndexRebuild(ctx, 'embedding_assignment_changed')),
    };
  }
  return row!;
}

export async function providerRuntime(providerId: string): Promise<ProviderRuntimeConfig> {
  const provider = await db.query.aiProviders.findFirst({ where: eq(schema.aiProviders.id, providerId) });
  if (!provider) throw new DomainError('NOT_FOUND', 'AI provider not found');
  const credentials: ProviderCredentials = decryptAiJson(provider.credentialsEncrypted);
  // Fallback: when a provider's DB credentials omit an apiKey, use the
  // optional OPENROUTER_API_KEY env var for OpenRouter providers. This lets
  // personal deployments configure AI via .env without pasting the key
  // into the admin UI.
  if (!credentials.apiKey && provider.vendor === 'openrouter' && env.OPENROUTER_API_KEY) {
    credentials.apiKey = env.OPENROUTER_API_KEY;
  }
  return {
    providerId: provider.id,
    name: provider.name,
    type: provider.type,
    vendor: provider.vendor,
    kind: provider.kind,
    baseUrl: provider.baseUrl,
    config: provider.config as Record<string, unknown>,
    credentials,
  };
}

async function reconcileDiscoveredModel(
  providerId: string,
  providerType: ProviderRow['type'],
  vendor: AiProviderVendor,
  model: DiscoveredModel,
  detector: { apiKey: string } | null,
  trustedCapabilityMatch = false,
): Promise<boolean> {
  // Without a configured detector, image/embedding providers have no reliable
  // way to distinguish capability-matching models from the chat-centric /models
  // payload. Skip discovery for non-chat providers to avoid catalog pollution;
  // rely on manual model addition instead.
  if (!trustedCapabilityMatch && !detector && providerType !== 'chat') return false;

  let enriched = model;
  let capabilities = model.capabilities;

  if (!trustedCapabilityMatch && detector) {
    const detected = await detectCapabilities(model.externalId, vendor, detector.apiKey).catch(() => null);
    if (detected) {
      // Filter out models whose output modality does not match the provider type.
      // OpenRouter reports output_modalities as text/image/embed; a chat model
      // surfaced on an image provider must not be reconciled as an image model.
      if (providerType === 'image' && !detected.outputModalities.includes('image')) return false;
      if (providerType === 'embedding' && !detected.outputModalities.some((m) => m === 'embed' || m === 'embedding')) return false;
      enriched = {
        ...model,
        canonicalId: detected.canonicalId ?? model.canonicalId,
        contextWindow: detected.contextWindow ?? model.contextWindow,
        maxOutputTokens: detected.maxOutputTokens ?? model.maxOutputTokens,
      };
      capabilities = detected.capabilities;
    }
    // If detection returns null (model not on OpenRouter), keep catalog capabilities as-is.
  }

  const [stored] = await db
    .insert(schema.aiModels)
    .values({
      providerId,
      externalId: enriched.externalId,
      canonicalId: enriched.canonicalId ?? null,
      displayName: enriched.displayName,
      availability: enriched.availability,
      contextWindow: enriched.contextWindow ?? null,
      maxOutputTokens: enriched.maxOutputTokens ?? null,
      embeddingDimensions: enriched.embeddingDimensions ?? null,
      inputModalities: enriched.inputModalities,
      outputModalities: enriched.outputModalities,
      rawMetadata: enriched.rawMetadata,
      lastSeenAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [schema.aiModels.providerId, schema.aiModels.externalId],
      set: {
        canonicalId: enriched.canonicalId ?? null,
        displayName: enriched.displayName,
        availability: enriched.availability,
        contextWindow: enriched.contextWindow ?? null,
        maxOutputTokens: enriched.maxOutputTokens ?? null,
        embeddingDimensions: enriched.embeddingDimensions ?? null,
        inputModalities: enriched.inputModalities,
        outputModalities: enriched.outputModalities,
        rawMetadata: enriched.rawMetadata,
        lastSeenAt: new Date(),
        updatedAt: new Date(),
      },
    })
    .returning({ id: schema.aiModels.id });
  for (const capability of capabilities) {
    await db
      .insert(schema.aiModelCapabilities)
      .values({ modelId: stored!.id, ...capability, details: capability.details ?? {} })
      .onConflictDoUpdate({
        target: [
          schema.aiModelCapabilities.modelId,
          schema.aiModelCapabilities.capability,
          schema.aiModelCapabilities.source,
        ],
        set: { supported: capability.supported, details: capability.details ?? {}, updatedAt: new Date() },
      });
  }
  return true;
}

export async function testProvider(providerId: string) {
  const runtime = await providerRuntime(providerId);
  const health = await (createModelDiscoveryAdapter(runtime) ?? createAiProviderAdapter(runtime)).testConnection();
  await db
    .update(schema.aiProviders)
    .set({
      status: health.ok ? 'healthy' : 'unavailable',
      lastCheckedAt: new Date(),
      lastErrorCode: health.errorCode ?? null,
      updatedAt: new Date(),
    })
    .where(eq(schema.aiProviders.id, providerId));
  return health;
}

/**
 * Run a connection test synchronously and return the result to the caller,
 * so the capability form can validate credentials before the provider is even
 * created. A `draft` config is tested in-memory; an `existing` provider reuses
 * its stored credentials and has its health status persisted.
 */
export async function testProviderConnection(
  ctx: PermCtx,
  input: AiProviderTest,
): Promise<ProviderHealth> {
  assertCanManageAi(ctx);
  let health: ProviderHealth;
  let providerId: string | null = null;
  let requestMetadata: Record<string, unknown>;
  if (input.mode === 'existing') {
    providerId = input.providerId;
    requestMetadata = { mode: 'existing', providerId: input.providerId };
    health = await testProvider(input.providerId);
  } else {
    const kind = resolveProviderProtocol(input.type, input.vendor, input.kind);
    const runtime: ProviderRuntimeConfig = {
      providerId: 'draft',
      name: 'draft',
      type: input.type,
      vendor: input.vendor,
      kind,
      baseUrl: validateBaseUrl(input.baseUrl),
      config: {},
      credentials: input.credentials,
    };
    requestMetadata = { mode: 'draft', type: input.type, vendor: input.vendor, baseUrl: runtime.baseUrl };
    health = await (createModelDiscoveryAdapter(runtime) ?? createAiProviderAdapter(runtime)).testConnection();
  }
  await recordTerminalAction(ctx, {
    feature: 'provider_test',
    status: health.ok ? 'completed' : 'failed',
    providerId,
    requestMetadata,
    resultMetadata: {
      ok: health.ok,
      latencyMs: health.latencyMs,
      ...(health.providerRequestId ? { providerRequestId: health.providerRequestId } : {}),
    },
    errorCode: health.errorCode ?? null,
    errorMessage: health.errorMessage ?? null,
    errorDetail: health.detail ? JSON.stringify(health.detail, null, 2) : null,
  });
  return health;
}

/**
 * Build the detector runtime config for a provider that selects a detector
 * source in its config, or return null when no detector is configured. The
 * detector credential comes from the provider's encrypted credentials — never
 * from the non-secret config blob.
 */
export function resolveDetectorRuntime(
  runtime: ProviderRuntimeConfig,
  detectorConfig: AiModelDetectorConfig,
): DetectorRuntimeConfig {
  return {
    source: detectorConfig.source,
    providerId: runtime.providerId,
    providerName: runtime.name,
    providerType: runtime.type,
    vendor: runtime.vendor,
    accountId: detectorConfig.cloudflareAccountId,
    namespace: detectorConfig.namespace,
    options: {
      includeDeprecated: detectorConfig.includeDeprecated,
      hideExperimental: detectorConfig.hideExperimental,
    },
    credentials: runtime.credentials,
  };
}

/**
 * Merge one normalized {@link DetectedModel} into `ai_models` /
 * `ai_model_capabilities`. Manually added models are never overwritten, and
 * manual (`source=manual`) capability rows are never touched — only
 * detector-owned rows are upserted. Returns whether the row was newly inserted.
 */
async function mergeDetectedModel(providerId: string, model: DetectedModel): Promise<'added' | 'updated' | 'skipped'> {
  const existing = await db.query.aiModels.findFirst({
    where: and(eq(schema.aiModels.providerId, providerId), eq(schema.aiModels.externalId, model.externalId)),
  });
  if (existing?.manuallyAdded) return 'skipped';

  const [stored] = await db
    .insert(schema.aiModels)
    .values({
      providerId,
      externalId: model.externalId,
      canonicalId: model.canonicalId ?? null,
      displayName: model.displayName,
      availability: model.availability,
      contextWindow: model.contextWindow ?? null,
      maxOutputTokens: model.maxOutputTokens ?? null,
      embeddingDimensions: model.embeddingDimensions ?? null,
      inputModalities: model.inputModalities,
      outputModalities: model.outputModalities,
      rawMetadata: model.rawMetadata,
      lastSeenAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [schema.aiModels.providerId, schema.aiModels.externalId],
      set: {
        canonicalId: model.canonicalId ?? null,
        displayName: model.displayName,
        availability: model.availability,
        contextWindow: model.contextWindow ?? null,
        maxOutputTokens: model.maxOutputTokens ?? null,
        embeddingDimensions: model.embeddingDimensions ?? null,
        inputModalities: model.inputModalities,
        outputModalities: model.outputModalities,
        rawMetadata: model.rawMetadata,
        lastSeenAt: new Date(),
        updatedAt: new Date(),
      },
    })
    .returning({ id: schema.aiModels.id });
  for (const capability of model.capabilities) {
    await db
      .insert(schema.aiModelCapabilities)
      .values({
        modelId: stored!.id,
        capability: capability.capability,
        supported: capability.supported,
        source: capability.source,
        details: capability.details,
      })
      .onConflictDoUpdate({
        target: [
          schema.aiModelCapabilities.modelId,
          schema.aiModelCapabilities.capability,
          schema.aiModelCapabilities.source,
        ],
        set: { supported: capability.supported, details: capability.details, updatedAt: new Date() },
      });
  }
  return existing ? 'updated' : 'added';
}

/**
 * Detector-backed model sync. Selects the registered detector for the provider,
 * lists normalized models, and merges detector-owned metadata while preserving
 * manual overrides and manually added models. Missing non-manual models are
 * marked unavailable, never hard-deleted.
 */
export async function syncProviderModelsViaDetector(
  runtime: ProviderRuntimeConfig,
  detectorConfig: AiModelDetectorConfig,
): Promise<AiModelSyncResult> {
  const detector = createDetector(resolveDetectorRuntime(runtime, detectorConfig));
  const controller = new AbortController();
  let result;
  try {
    result = await detector.listModels({ abortSignal: controller.signal });
  } catch (error) {
    const normalized = error instanceof DetectorError ? error : normalizeDetectorError(error);
    throw new DomainError(
      normalized.retryable ? 'PROVIDER_UNAVAILABLE' : 'INVALID_RESPONSE',
      normalized.message,
    );
  }

  const kept: string[] = [];
  let added = 0;
  let updated = 0;
  let skipped = result.counts.skipped ?? 0;
  for (const model of result.models) {
    const outcome = await mergeDetectedModel(runtime.providerId, model);
    if (outcome === 'skipped') {
      skipped++;
      continue;
    }
    kept.push(model.externalId);
    if (outcome === 'added') added++;
    else updated++;
  }

  let unavailable = result.counts.unavailable ?? 0;
  const unseen = await db
    .update(schema.aiModels)
    .set({ availability: 'unavailable', updatedAt: new Date() })
    .where(
      and(
        eq(schema.aiModels.providerId, runtime.providerId),
        eq(schema.aiModels.manuallyAdded, false),
        kept.length ? notInArray(schema.aiModels.externalId, kept) : undefined,
        eq(schema.aiModels.availability, 'available'),
      ),
    )
    .returning({ id: schema.aiModels.id });
  unavailable += unseen.length;

  return {
    count: kept.length,
    skipped,
    detectorSource: detectorConfig.source,
    freshness: result.freshness,
    added,
    updated,
    unavailable,
    partial: result.counts.partial ?? 0,
    warnings: result.warnings,
  };
}

export async function syncProviderModels(providerId: string): Promise<AiModelSyncResult> {
  const runtime = await providerRuntime(providerId);
  const detectorConfig = readModelDetectorConfig(runtime.config);
  if (detectorConfig) {
    return syncProviderModelsViaDetector(runtime, detectorConfig);
  }
  const settings = await getAiSettings();
  const detector = settings.modelDetectorApiKeyEncrypted
    ? { apiKey: (decryptAiJson(settings.modelDetectorApiKeyEncrypted) as { apiKey: string }).apiKey }
    : null;
  let models: DiscoveredModel[];
  let trustedCapabilityMatch = false;

  if (runtime.type === 'image') {
    const builtinModels = getAiProviderVendor(runtime.vendor).builtinModels?.image ?? [];
    models = builtinModels.map((model) => ({
      externalId: model.id,
      displayName: model.name,
      availability: 'available',
      inputModalities: ['text'],
      outputModalities: ['image'],
      capabilities: [
        { capability: 'image_generation', supported: true, source: 'provider' },
      ],
      rawMetadata: { source: 'builtin_vendor_catalog', vendor: runtime.vendor },
    }));
    trustedCapabilityMatch = true;
  } else if (runtime.type === 'embedding') {
    const apiKey = runtime.vendor === 'openrouter'
      ? runtime.credentials.apiKey
      : detector?.apiKey;
    if (!apiKey) return { count: 0, skipped: 0 };
    models = (await listEmbeddingModels(runtime.vendor, apiKey)).map((model) => ({
      externalId: model.externalId,
      canonicalId: model.canonicalId,
      displayName: model.displayName,
      availability: 'available',
      contextWindow: model.contextWindow,
      embeddingDimensions: model.embeddingDimensions,
      inputModalities: model.inputModalities,
      outputModalities: model.outputModalities,
      capabilities: [
        { capability: 'embedding', supported: true, source: 'provider' },
      ],
      rawMetadata: {
        ...model.rawMetadata,
        multilingualSupport: model.multilingualSupport,
      },
    }));
    trustedCapabilityMatch = true;
  } else {
    const discovery = createModelDiscoveryAdapter(runtime);
    if (!discovery) return { count: 0, skipped: 0 };
    models = await discovery.listModels();
  }

  const kept: string[] = [];
  let skipped = 0;
  for (const model of models) {
    const keep = await reconcileDiscoveredModel(
      providerId,
      runtime.type,
      runtime.vendor,
      model,
      detector,
      trustedCapabilityMatch,
    );
    if (keep) kept.push(model.externalId);
    else skipped++;
  }
  if (kept.length) {
    await db
      .update(schema.aiModels)
      .set({ availability: 'unavailable', updatedAt: new Date() })
      .where(
        and(
          eq(schema.aiModels.providerId, providerId),
          eq(schema.aiModels.manuallyAdded, false),
          notInArray(schema.aiModels.externalId, kept),
        ),
      );
    await db
      .update(schema.aiModels)
      .set({ availability: 'available' })
      .where(and(eq(schema.aiModels.providerId, providerId), inArray(schema.aiModels.externalId, kept)));
  }
  return { count: kept.length, skipped };
}

export type StartModelSyncResult =
  | { mode: 'action'; action: { id: string; feature: 'model_sync'; status: string; providerId: string; eventsUrl: string } }
  | { mode: 'sync'; result: AiModelSyncResult };

/**
 * Start provider model synchronization. Detector-backed providers (whose config
 * selects a detector source) run through the `model_sync` action lifecycle so
 * per-model schema enrichment cannot block the admin request; a non-terminal
 * run is resumed rather than duplicated. Other providers still sync inline.
 */
export async function startProviderModelSync(
  ctx: PermCtx,
  providerId: string,
): Promise<StartModelSyncResult> {
  assertCanManageAi(ctx);
  const provider = await db.query.aiProviders.findFirst({ where: eq(schema.aiProviders.id, providerId) });
  if (!provider) throw new DomainError('NOT_FOUND', 'AI provider not found');
  if (!provider.enabled) throw new DomainError('PROVIDER_DISABLED', 'AI provider is disabled');

  const detectorConfig = readModelDetectorConfig(provider.config as Record<string, unknown>);
  if (!detectorConfig) {
    return { mode: 'sync', result: await syncProviderModelsNow(ctx, providerId) };
  }

  // Resume an in-flight run instead of starting a duplicate.
  const existing = await db.query.aiActions.findFirst({
    where: and(
      eq(schema.aiActions.providerId, providerId),
      eq(schema.aiActions.feature, 'model_sync'),
      inArray(schema.aiActions.status, ['queued', 'running']),
    ),
  });
  if (existing) {
    return {
      mode: 'action',
      action: {
        id: existing.id,
        feature: 'model_sync',
        status: existing.status,
        providerId,
        eventsUrl: `/api/ai/actions/${existing.id}`,
      },
    };
  }

  const accepted = await createAction(ctx, {
    feature: 'model_sync',
    input: { providerId },
    providerId,
    requestMetadata: { providerId, detectorSource: detectorConfig.source },
  });
  return {
    mode: 'action',
    action: {
      id: accepted.id,
      feature: 'model_sync',
      status: accepted.status,
      providerId,
      eventsUrl: `/api/ai/actions/${accepted.id}`,
    },
  };
}

export async function syncProviderModelsNow(ctx: PermCtx, providerId: string) {
  assertCanManageAi(ctx);
  const provider = await db.query.aiProviders.findFirst({
    where: eq(schema.aiProviders.id, providerId),
  });
  if (!provider) throw new DomainError('NOT_FOUND', 'AI provider not found');
  if (!provider.enabled) throw new DomainError('PROVIDER_DISABLED', 'AI provider is disabled');
  try {
    const result = await syncProviderModels(providerId);
    await recordTerminalAction(ctx, {
      feature: 'model_sync',
      status: 'completed',
      providerId,
      requestMetadata: { providerId, mode: 'synchronous' },
      resultMetadata: result,
    });
    return result;
  } catch (error) {
    const normalized = normalizeProviderError(error);
    await recordTerminalAction(ctx, {
      feature: 'model_sync',
      status: 'failed',
      providerId,
      requestMetadata: { providerId, mode: 'synchronous' },
      errorCode: normalized.code,
      errorMessage: normalized.message,
      errorDetail: normalized.detail ? JSON.stringify(normalized.detail, null, 2) : null,
    });
    throw error;
  }
}
