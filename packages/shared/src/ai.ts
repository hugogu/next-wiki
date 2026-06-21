import { z } from 'zod';

export const aiProviderTypeSchema = z.enum(['chat', 'embedding', 'image']);
export type AiProviderType = z.infer<typeof aiProviderTypeSchema>;
export const aiProviderKindSchema = z.enum([
  'openai_compatible',
  'openrouter',
  'anthropic',
  'voyage',
  'minimax',
]);
export type AiProviderKind = z.infer<typeof aiProviderKindSchema>;
export const aiProviderVendorSchema = z.enum([
  'openai',
  'openrouter',
  'anthropic',
  'kimi',
  'voyage',
  'minimax',
  'custom',
]);
export type AiProviderVendor = z.infer<typeof aiProviderVendorSchema>;
export type AiModelDiscoveryProtocol = 'openai' | 'openrouter' | 'anthropic' | 'none';

export type AiProviderVendorDefinition = {
  vendor: AiProviderVendor;
  capabilities: AiProviderType[];
  protocols: Partial<Record<AiProviderType, AiProviderKind>>;
  baseUrls: Partial<Record<AiProviderType, string>>;
  modelDiscovery: AiModelDiscoveryProtocol;
};

export const AI_PROVIDER_VENDORS: AiProviderVendorDefinition[] = [
  {
    vendor: 'openai',
    capabilities: ['chat', 'embedding', 'image'],
    protocols: {
      chat: 'openai_compatible',
      embedding: 'openai_compatible',
      image: 'openai_compatible',
    },
    baseUrls: {
      chat: 'https://api.openai.com/v1',
      embedding: 'https://api.openai.com/v1',
      image: 'https://api.openai.com/v1',
    },
    modelDiscovery: 'openai',
  },
  {
    vendor: 'openrouter',
    capabilities: ['chat', 'embedding', 'image'],
    protocols: { chat: 'openrouter', embedding: 'openrouter', image: 'openrouter' },
    baseUrls: {
      chat: 'https://openrouter.ai/api/v1',
      embedding: 'https://openrouter.ai/api/v1',
      image: 'https://openrouter.ai/api/v1',
    },
    modelDiscovery: 'openrouter',
  },
  {
    vendor: 'anthropic',
    capabilities: ['chat'],
    protocols: { chat: 'anthropic' },
    baseUrls: { chat: 'https://api.anthropic.com/v1' },
    modelDiscovery: 'anthropic',
  },
  {
    vendor: 'kimi',
    capabilities: ['chat'],
    protocols: { chat: 'openai_compatible' },
    baseUrls: { chat: 'https://api.moonshot.cn/v1' },
    modelDiscovery: 'openai',
  },
  {
    vendor: 'voyage',
    capabilities: ['embedding'],
    protocols: { embedding: 'voyage' },
    baseUrls: { embedding: 'https://api.voyageai.com/v1' },
    modelDiscovery: 'none',
  },
  {
    vendor: 'minimax',
    capabilities: ['image'],
    protocols: { image: 'minimax' },
    baseUrls: { image: 'https://api.minimaxi.com/v1' },
    modelDiscovery: 'none',
  },
  {
    vendor: 'custom',
    capabilities: ['chat', 'embedding', 'image'],
    protocols: {
      chat: 'openai_compatible',
      embedding: 'openai_compatible',
      image: 'openai_compatible',
    },
    baseUrls: {},
    modelDiscovery: 'openai',
  },
];

export function getAiProviderVendor(
  vendor: AiProviderVendor,
): AiProviderVendorDefinition {
  return AI_PROVIDER_VENDORS.find((item) => item.vendor === vendor)!;
}
export const aiProviderStatusSchema = z.enum(['unverified', 'healthy', 'unavailable', 'disabled']);
export const aiModelAvailabilitySchema = z.enum(['available', 'unavailable', 'unknown']);
export const aiCapabilitySchema = z.enum([
  'text_generation',
  'embedding',
  'image_generation',
  'vision',
  'audio',
  'thinking',
]);
export type AiCapability = z.infer<typeof aiCapabilitySchema>;
export const aiCapabilitySourceSchema = z.enum(['provider', 'catalog', 'manual']);
export const aiPurposeSchema = z.enum(['wiki_text', 'wiki_embedding', 'wiki_image']);
export type AiPurpose = z.infer<typeof aiPurposeSchema>;
export const aiIndexStatusSchema = z.enum(['building', 'ready', 'failed', 'superseded']);
export const aiPageIndexStatusSchema = z.enum(['pending', 'running', 'completed', 'failed', 'removed']);
export const aiActionFeatureSchema = z.enum([
  'provider_test',
  'model_sync',
  'index_rebuild',
  'semantic_search',
  'wiki_question',
  'text_optimization',
  'image_generation',
]);
export type AiActionFeature = z.infer<typeof aiActionFeatureSchema>;
export const aiActionStatusSchema = z.enum(['queued', 'running', 'completed', 'failed', 'cancelled', 'expired']);
export type AiActionStatus = z.infer<typeof aiActionStatusSchema>;
export const aiQuestionModeSchema = z.enum(['full', 'retrieval']);
export type AiQuestionMode = z.infer<typeof aiQuestionModeSchema>;
export const aiEventTypeSchema = z.enum([
  'status',
  'text_delta',
  'search_results',
  'citations',
  'optimization',
  'image_ready',
  'completed',
  'error',
]);
export type AiEventType = z.infer<typeof aiEventTypeSchema>;

const jsonObjectSchema = z.record(z.string(), z.unknown()).default({});

export const aiSettingsUpdateSchema = z.object({
  enabled: z.boolean().optional(),
  eventRetentionHours: z.number().int().min(1).max(168).optional(),
  artifactRetentionHours: z.number().int().min(1).max(168).optional(),
});
export type AiSettingsUpdate = z.infer<typeof aiSettingsUpdateSchema>;

export const aiProviderCredentialsSchema = z
  .object({
    apiKey: z.string().min(1).max(8_192).optional(),
    headers: z.record(z.string(), z.string().max(8_192)).optional(),
  })
  .refine((value) => value.apiKey || Object.keys(value.headers ?? {}).length > 0);

export const aiProviderCreateSchema = z.object({
  name: z.string().trim().min(1).max(100),
  type: aiProviderTypeSchema.default('chat'),
  vendor: aiProviderVendorSchema,
  kind: aiProviderKindSchema.optional(),
  baseUrl: z.string().url().max(2_048),
  config: jsonObjectSchema,
  credentials: aiProviderCredentialsSchema,
  enabled: z.boolean().default(true),
}).superRefine((value, context) => {
  const definition = getAiProviderVendor(value.vendor);
  if (!definition.capabilities.includes(value.type)) {
    context.addIssue({
      code: 'custom',
      path: ['vendor'],
      message: `${value.vendor} does not support ${value.type}`,
    });
  }
});
export type AiProviderCreate = z.infer<typeof aiProviderCreateSchema>;
export const aiProviderUpdateSchema = z.object({
  name: z.string().trim().min(1).max(100),
  type: aiProviderTypeSchema,
  vendor: aiProviderVendorSchema,
  kind: aiProviderKindSchema,
  baseUrl: z.string().url().max(2_048),
  config: jsonObjectSchema,
  enabled: z.boolean(),
})
  .partial()
  .extend({ credentials: aiProviderCredentialsSchema.optional() });
export type AiProviderUpdate = z.infer<typeof aiProviderUpdateSchema>;

export const aiProviderViewSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  type: aiProviderTypeSchema,
  vendor: aiProviderVendorSchema,
  kind: aiProviderKindSchema,
  baseUrl: z.string(),
  config: jsonObjectSchema,
  hasCredentials: z.boolean(),
  enabled: z.boolean(),
  status: aiProviderStatusSchema,
  lastCheckedAt: z.string().nullable(),
  lastErrorCode: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type AiProviderView = z.infer<typeof aiProviderViewSchema>;

export const aiCapabilityViewSchema = z.object({
  capability: aiCapabilitySchema,
  supported: z.boolean().nullable(),
  source: aiCapabilitySourceSchema.nullable(),
  details: jsonObjectSchema.optional(),
});
export const aiModelCreateSchema = z.object({
  externalId: z.string().trim().min(1).max(300),
  displayName: z.string().trim().min(1).max(300),
  contextWindow: z.number().int().positive().nullable().optional(),
  maxOutputTokens: z.number().int().positive().nullable().optional(),
  embeddingDimensions: z.number().int().positive().nullable().optional(),
});
export type AiModelCreate = z.infer<typeof aiModelCreateSchema>;
export const aiModelUpdateSchema = aiModelCreateSchema.omit({ externalId: true }).partial();
export type AiModelUpdate = z.infer<typeof aiModelUpdateSchema>;
export const aiCapabilityOverrideSchema = z.object({ supported: z.boolean(), details: jsonObjectSchema });
export const aiAssignmentUpdateSchema = z.object({
  modelId: z.string().uuid(),
  confirmCapability: z.boolean().default(false),
  embeddingDimensions: z.number().int().positive().nullable().optional(),
});
export const aiModelViewSchema = z.object({
  id: z.string().uuid(),
  providerId: z.string().uuid(),
  providerName: z.string(),
  providerType: aiProviderTypeSchema,
  externalId: z.string(),
  canonicalId: z.string().nullable(),
  displayName: z.string(),
  availability: aiModelAvailabilitySchema,
  contextWindow: z.number().nullable(),
  maxOutputTokens: z.number().nullable(),
  embeddingDimensions: z.number().nullable(),
  inputModalities: z.array(z.string()),
  outputModalities: z.array(z.string()),
  manuallyAdded: z.boolean(),
  capabilities: z.array(aiCapabilityViewSchema),
  lastSeenAt: z.string().nullable(),
});
export type AiModelView = z.infer<typeof aiModelViewSchema>;

export const aiEntitlementUpdateSchema = z.object({
  questionAnsweringEnabled: z.boolean(),
  textOptimizationEnabled: z.boolean(),
  imageGenerationEnabled: z.boolean(),
});
export type AiEntitlementUpdate = z.infer<typeof aiEntitlementUpdateSchema>;
export const aiEntitlementViewSchema = aiEntitlementUpdateSchema.extend({
  userId: z.string().uuid(),
  aiEnabled: z.boolean(),
  reasons: z.array(z.string()),
});
export type AiEntitlementView = z.infer<typeof aiEntitlementViewSchema>;

export const aiActionViewSchema = z.object({
  id: z.string().uuid(),
  feature: aiActionFeatureSchema,
  status: aiActionStatusSchema,
  actorUserId: z.string().uuid().nullable(),
  providerId: z.string().uuid().nullable(),
  providerName: z.string().nullable(),
  modelId: z.string().uuid().nullable(),
  modelName: z.string().nullable(),
  indexGenerationId: z.string().uuid().nullable(),
  pageId: z.string().uuid().nullable(),
  questionMode: aiQuestionModeSchema.nullable(),
  requestMetadata: jsonObjectSchema,
  resultMetadata: jsonObjectSchema,
  usageMetadata: jsonObjectSchema,
  errorCode: z.string().nullable(),
  errorMessage: z.string().nullable(),
  queuedAt: z.string(),
  startedAt: z.string().nullable(),
  finishedAt: z.string().nullable(),
  expiresAt: z.string(),
});
export type AiActionView = z.infer<typeof aiActionViewSchema>;
export const aiActionAcceptedSchema = z.object({
  id: z.string().uuid(),
  feature: aiActionFeatureSchema,
  status: z.literal('queued'),
  eventsUrl: z.string(),
});
export type AiActionAccepted = z.infer<typeof aiActionAcceptedSchema>;
export const aiActionEventSchema = z.object({
  id: z.number().int().positive(),
  actionId: z.string().uuid(),
  type: aiEventTypeSchema,
  payload: jsonObjectSchema,
  createdAt: z.string(),
});
export type AiActionEvent = z.infer<typeof aiActionEventSchema>;

export const aiCitationSchema = z.object({
  pageId: z.string().uuid(),
  title: z.string(),
  path: z.string(),
  locale: z.string(),
  revisionId: z.string().uuid(),
  revisionHash: z.string(),
});
export type AiCitation = z.infer<typeof aiCitationSchema>;
export const aiSearchResultSchema = aiCitationSchema.extend({
  excerpt: z.string(),
  score: z.number().min(-1).max(1),
});
export type AiSearchResult = z.infer<typeof aiSearchResultSchema>;

export const aiSearchInputSchema = z.object({
  query: z.string().trim().min(1).max(8_000),
  limit: z.number().int().min(1).max(50).default(10),
});
export const aiQuestionInputSchema = z.object({
  question: z.string().trim().min(1).max(16_000),
  mode: aiQuestionModeSchema,
  currentPage: z.object({ pageId: z.string().uuid(), revisionId: z.string().uuid() }).optional(),
});
export const aiSelectionSchema = z.object({
  text: z.string().min(1).max(100_000),
  hash: z.string().min(16).max(128),
  from: z.number().int().nonnegative(),
  to: z.number().int().positive(),
});
export const aiOptimizationInputSchema = z.object({
  pageId: z.string().uuid(),
  revisionId: z.string().uuid(),
  selection: aiSelectionSchema.refine((value) => value.to > value.from),
  instruction: z.enum(['improve_clarity', 'fix_grammar', 'shorten', 'expand']).default('improve_clarity'),
});
export const aiImageInputSchema = z.object({
  pageId: z.string().uuid(),
  revisionId: z.string().uuid(),
  source: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('page') }),
    z.object({ kind: z.literal('selection'), text: z.string().min(1).max(100_000), hash: z.string().min(16).max(128) }),
  ]),
  aspectRatio: z.enum(['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9']).optional(),
});
export const aiArtifactPromotionSchema = z.object({ pageId: z.string().uuid() });
export const aiIndexCreateSchema = z.object({ reason: z.string().max(200).default('manual') });
export const aiIndexRetrySchema = z.object({ pageIds: z.array(z.string().uuid()).max(1_000).default([]) });
export const aiIndexViewSchema = z.object({
  id: z.string().uuid(),
  modelId: z.string().uuid(),
  modelName: z.string(),
  embeddingDimensions: z.number().int().positive(),
  chunkerVersion: z.string(),
  status: aiIndexStatusSchema,
  isActive: z.boolean(),
  totalPages: z.number().int().nonnegative(),
  completedPages: z.number().int().nonnegative(),
  failedPages: z.number().int().nonnegative(),
  startedAt: z.string().nullable(),
  readyAt: z.string().nullable(),
  finishedAt: z.string().nullable(),
  errorCode: z.string().nullable(),
  errorMessage: z.string().nullable(),
  createdAt: z.string(),
});
export type AiIndexView = z.infer<typeof aiIndexViewSchema>;

export const aiApiErrorCodeSchema = z.enum([
  'AI_DISABLED',
  'AI_NOT_CONFIGURED',
  'AI_FEATURE_DISABLED',
  'PROVIDER_IN_USE',
  'PROVIDER_DISABLED',
  'MODEL_UNAVAILABLE',
  'MODEL_NOT_FOUND',
  'CAPABILITY_MISMATCH',
  'CAPABILITY_UNSUPPORTED',
  'EMBEDDING_DIMENSIONS_REQUIRED',
  'INDEX_NOT_READY',
  'FULL_CONTEXT_TOO_LARGE',
  'INSUFFICIENT_WIKI_EVIDENCE',
  'RATE_LIMITED',
  'INPUT_TOO_LARGE',
  'CONTENT_REJECTED',
  'TIMEOUT',
  'PROVIDER_UNAVAILABLE',
  'INVALID_RESPONSE',
  'CANCELLED',
]);
export type AiApiErrorCode = z.infer<typeof aiApiErrorCodeSchema>;
