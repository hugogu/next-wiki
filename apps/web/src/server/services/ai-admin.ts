import { and, asc, eq, inArray, notInArray } from 'drizzle-orm';
import {
  getAiProviderVendor,
  type AiCapability,
  type AiModelCreate,
  type AiModelView,
  type AiProviderCreate,
  type AiProviderKind,
  type AiProviderType,
  type AiProviderUpdate,
  type AiProviderView,
  type AiPurpose,
  type AiSettingsUpdate,
} from '@next-wiki/shared';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { can, getActorUserId, type PermCtx } from '@/server/permissions';
import { DomainError } from '@/server/errors';
import { decryptAiJson, encryptAiJson } from '@/server/crypto/ai-encryption';
import { createAction, getAiSettings } from './ai-actions';
import { createAiProviderAdapter, createModelDiscoveryAdapter } from '@/server/ai/registry';
import type { DiscoveredModel, ProviderRuntimeConfig } from '@/server/ai/types';

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
    assignments,
  };
}

export async function updateSettings(ctx: PermCtx, input: AiSettingsUpdate) {
  assertCanManageAi(ctx);
  const values = {
    ...input,
    updatedBy: actorId(ctx),
    updatedAt: new Date(),
  };
  const [row] = await db
    .insert(schema.aiSettings)
    .values({ id: 'default', ...values })
    .onConflictDoUpdate({ target: schema.aiSettings.id, set: values })
    .returning();
  return row!;
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
  const assigned = await db
    .select({ purpose: schema.aiPurposeAssignments.purpose })
    .from(schema.aiPurposeAssignments)
    .innerJoin(schema.aiModels, eq(schema.aiPurposeAssignments.modelId, schema.aiModels.id))
    .where(eq(schema.aiModels.providerId, id))
    .limit(1);
  const active = await db.query.aiActions.findFirst({
    where: and(eq(schema.aiActions.providerId, id), inArray(schema.aiActions.status, ['queued', 'running'])),
  });
  if (assigned.length || active) throw new DomainError('PROVIDER_IN_USE', 'AI provider is in use');
  const deleted = await db.delete(schema.aiProviders).where(eq(schema.aiProviders.id, id)).returning();
  if (!deleted.length) throw new DomainError('NOT_FOUND', 'AI provider not found');
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
  return {
    providerId: provider.id,
    name: provider.name,
    type: provider.type,
    vendor: provider.vendor,
    kind: provider.kind,
    baseUrl: provider.baseUrl,
    config: provider.config as Record<string, unknown>,
    credentials: decryptAiJson(provider.credentialsEncrypted),
  };
}

async function reconcileDiscoveredModel(
  providerId: string,
  providerType: ProviderRow['type'],
  model: DiscoveredModel,
): Promise<void> {
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
  const primaryCapability: AiCapability =
    providerType === 'chat'
      ? 'text_generation'
      : providerType === 'embedding'
        ? 'embedding'
        : 'image_generation';
  const capabilities = [
    ...model.capabilities.filter((item) => item.capability !== primaryCapability),
    {
      capability: primaryCapability,
      supported: true,
      source: 'provider' as const,
      details: { providerType },
    },
  ];
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

export async function syncProviderModels(providerId: string) {
  const runtime = await providerRuntime(providerId);
  const discovery = createModelDiscoveryAdapter(runtime);
  if (!discovery) return { count: 0 };
  const models = await discovery.listModels();
  const seen = models.map((model) => model.externalId);
  for (const model of models) await reconcileDiscoveredModel(providerId, runtime.type, model);
  if (seen.length) {
    await db
      .update(schema.aiModels)
      .set({ availability: 'unavailable', updatedAt: new Date() })
      .where(
        and(
          eq(schema.aiModels.providerId, providerId),
          eq(schema.aiModels.manuallyAdded, false),
          notInArray(schema.aiModels.externalId, seen),
        ),
      );
    await db
      .update(schema.aiModels)
      .set({ availability: 'available' })
      .where(and(eq(schema.aiModels.providerId, providerId), inArray(schema.aiModels.externalId, seen)));
  }
  return { count: models.length };
}
