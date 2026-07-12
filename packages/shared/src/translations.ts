import { z } from 'zod';

// ---- Enums (mirror db/schema/enums.ts) -------------------------------------

export const translationRunKindSchema = z.enum(['initial', 'resume', 'replacement', 'refresh']);
export const translationRunStatusSchema = z.enum([
  'queued',
  'running',
  'paused',
  'completed',
  'completed_with_warnings',
  'failed',
  'cancelled',
]);
export const translationItemStatusSchema = z.enum([
  'pending',
  'running',
  'completed',
  'skipped',
  'failed',
  'cancelled',
  'superseded',
]);
export const translationFreshnessStatusSchema = z.enum([
  'fresh',
  'stale',
  'queued',
  'running',
  'failed',
  'unavailable',
]);
export const translationUsageSourceSchema = z.enum([
  'provider_reported',
  'estimated',
  'unavailable',
]);

export type TranslationRunKind = z.infer<typeof translationRunKindSchema>;
export type TranslationRunStatus = z.infer<typeof translationRunStatusSchema>;
export type TranslationItemStatus = z.infer<typeof translationItemStatusSchema>;
export type TranslationFreshnessStatus = z.infer<typeof translationFreshnessStatusSchema>;
export type TranslationUsageSource = z.infer<typeof translationUsageSourceSchema>;

const isoDateSchema = z.string().datetime();
const nullableIsoDateSchema = isoDateSchema.nullable();
const nonNegativeInt = z.number().int().nonnegative();

/** Normalized lowercase ISO 639-1 content language code. */
export const localeCodeSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z]{2}$/, 'Language must be a two-letter ISO 639-1 code');
export type LocaleCode = z.infer<typeof localeCodeSchema>;

// ---- Target languages ------------------------------------------------------

export const translationLanguageCreateSchema = z.object({
  code: localeCodeSchema,
  enabled: z.boolean().default(true),
  defaultPromptVersionId: z.string().uuid().nullish(),
  defaultModelId: z.string().uuid().nullish(),
});
export type TranslationLanguageCreate = z.infer<typeof translationLanguageCreateSchema>;

export const translationLanguageUpdateSchema = z.object({
  enabled: z.boolean().optional(),
  defaultPromptVersionId: z.string().uuid().nullish(),
  defaultModelId: z.string().uuid().nullish(),
});
export type TranslationLanguageUpdate = z.infer<typeof translationLanguageUpdateSchema>;

export const translationLanguageViewSchema = z.object({
  code: z.string(),
  enabled: z.boolean(),
  retired: z.boolean(),
  defaultPromptVersionId: z.string().uuid().nullable(),
  defaultModelId: z.string().uuid().nullable(),
  defaultModelName: z.string().nullable(),
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
});
export type TranslationLanguageView = z.infer<typeof translationLanguageViewSchema>;

// ---- Prompt styles ---------------------------------------------------------

export const translationPromptCreateSchema = z.object({
  name: z.string().trim().min(1).max(100),
  body: z.string().trim().min(1).max(8000),
});
export type TranslationPromptCreate = z.infer<typeof translationPromptCreateSchema>;

export const translationPromptUpdateSchema = z.object({
  body: z.string().trim().min(1).max(8000),
});
export type TranslationPromptUpdate = z.infer<typeof translationPromptUpdateSchema>;

export const translationPromptVersionViewSchema = z.object({
  id: z.string().uuid(),
  versionNumber: z.number().int().positive(),
  body: z.string(),
  contentHash: z.string(),
  createdAt: isoDateSchema,
});
export type TranslationPromptVersionView = z.infer<typeof translationPromptVersionViewSchema>;

export const translationPromptTemplateViewSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  retired: z.boolean(),
  currentVersion: translationPromptVersionViewSchema.nullable(),
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
});
export type TranslationPromptTemplateView = z.infer<typeof translationPromptTemplateViewSchema>;

export const translationPromptDetailSchema = translationPromptTemplateViewSchema.extend({
  versions: z.array(translationPromptVersionViewSchema),
});
export type TranslationPromptDetail = z.infer<typeof translationPromptDetailSchema>;

// ---- Runs ------------------------------------------------------------------

export const translationRunScopeSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('all_published') }),
  z.object({ kind: z.literal('page_ids'), pageIds: z.array(z.string().uuid()).min(1).max(5000) }),
  z.object({ kind: z.literal('paths'), paths: z.array(z.string().min(1)).min(1).max(5000) }),
]);
export type TranslationRunScope = z.infer<typeof translationRunScopeSchema>;

export const translationRunModeSchema = z.enum(['missing', 'all']);
export type TranslationRunMode = z.infer<typeof translationRunModeSchema>;

export const translationRunCreateSchema = z.object({
  targetLocale: localeCodeSchema,
  promptVersionId: z.string().uuid().optional(),
  modelId: z.string().uuid().optional(),
  scope: translationRunScopeSchema.default({ kind: 'all_published' }),
  mode: translationRunModeSchema.default('missing'),
});
export type TranslationRunCreate = z.infer<typeof translationRunCreateSchema>;

export const translationUsageTotalsSchema = z.object({
  inputTokens: z.number().int().nullable(),
  outputTokens: z.number().int().nullable(),
  cachedTokens: z.number().int().nullable(),
  source: translationUsageSourceSchema,
});
export type TranslationUsageTotals = z.infer<typeof translationUsageTotalsSchema>;

export const translationRunViewSchema = z.object({
  id: z.string().uuid(),
  targetLocale: z.string(),
  kind: translationRunKindSchema,
  status: translationRunStatusSchema,
  predecessorRunId: z.string().uuid().nullable(),
  modelId: z.string().uuid().nullable(),
  modelName: z.string().nullable(),
  promptVersionId: z.string().uuid().nullable(),
  totalItems: nonNegativeInt,
  processedItems: nonNegativeInt,
  completedItems: nonNegativeInt,
  skippedItems: nonNegativeInt,
  failedItems: nonNegativeInt,
  supersededItems: nonNegativeInt,
  currentItem: z.string().nullable(),
  usage: translationUsageTotalsSchema,
  totalDurationMs: nonNegativeInt,
  cancelRequested: z.boolean(),
  pauseRequested: z.boolean(),
  errorCode: z.string().nullable(),
  errorMessage: z.string().nullable(),
  queuedAt: isoDateSchema,
  startedAt: nullableIsoDateSchema,
  finishedAt: nullableIsoDateSchema,
  canPause: z.boolean(),
  canResume: z.boolean(),
  canCancel: z.boolean(),
  canRetry: z.boolean(),
});
export type TranslationRunView = z.infer<typeof translationRunViewSchema>;

export const translationRunAcceptedSchema = z.object({
  id: z.string().uuid(),
  targetLocale: z.string(),
  status: z.literal('queued'),
  detailUrl: z.string(),
});
export type TranslationRunAccepted = z.infer<typeof translationRunAcceptedSchema>;

export const translationRunItemViewSchema = z.object({
  id: z.string().uuid(),
  runId: z.string().uuid(),
  sourcePageId: z.string().uuid(),
  sourceRevisionId: z.string().uuid().nullable(),
  translationPageId: z.string().uuid().nullable(),
  translationRevisionId: z.string().uuid().nullable(),
  targetLocale: z.string(),
  targetPath: z.string().nullable(),
  status: translationItemStatusSchema,
  attempts: nonNegativeInt,
  retryAvailable: z.boolean(),
  usage: translationUsageTotalsSchema,
  durationMs: z.number().int().nullable(),
  warningCode: z.string().nullable(),
  errorCode: z.string().nullable(),
  errorMessage: z.string().nullable(),
  startedAt: nullableIsoDateSchema,
  finishedAt: nullableIsoDateSchema,
});
export type TranslationRunItemView = z.infer<typeof translationRunItemViewSchema>;

export const translationRunRetrySchema = z.object({
  promptVersionId: z.string().uuid().optional(),
  modelId: z.string().uuid().optional(),
  scope: translationRunScopeSchema.optional(),
});
export type TranslationRunRetry = z.infer<typeof translationRunRetrySchema>;

// ---- Query params ----------------------------------------------------------

export const translationRunQuerySchema = z.object({
  targetLocale: localeCodeSchema.optional(),
  status: translationRunStatusSchema.optional(),
  kind: translationRunKindSchema.optional(),
  modelId: z.string().uuid().optional(),
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});
export type TranslationRunQuery = z.infer<typeof translationRunQuerySchema>;

export const translationRunItemQuerySchema = z.object({
  status: translationItemStatusSchema.optional(),
  sourcePageId: z.string().uuid().optional(),
  q: z.string().trim().min(1).max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});
export type TranslationRunItemQuery = z.infer<typeof translationRunItemQuerySchema>;

// ---- Documents & analytics -------------------------------------------------

export const translationDocumentViewSchema = z.object({
  translationPageId: z.string().uuid(),
  sourcePageId: z.string().uuid(),
  sourcePath: z.string(),
  targetLocale: z.string(),
  sourceUrl: z.string(),
  translationUrl: z.string(),
  freshness: translationFreshnessStatusSchema,
  currentTranslatedRevisionId: z.string().uuid().nullable(),
  lastRunId: z.string().uuid().nullable(),
  updatedAt: isoDateSchema,
});
export type TranslationDocumentView = z.infer<typeof translationDocumentViewSchema>;

export const translationDocumentQuerySchema = z.object({
  sourcePageId: z.string().uuid().optional(),
  targetLocale: localeCodeSchema.optional(),
  freshness: translationFreshnessStatusSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});
export type TranslationDocumentQuery = z.infer<typeof translationDocumentQuerySchema>;

export const translationVersionViewSchema = z.object({
  revisionId: z.string().uuid(),
  versionNumber: z.number().int(),
  sourceRevisionId: z.string().uuid().nullable(),
  modelId: z.string().uuid().nullable(),
  modelName: z.string().nullable(),
  promptVersionId: z.string().uuid().nullable(),
  runId: z.string().uuid().nullable(),
  itemId: z.string().uuid().nullable(),
  usage: translationUsageTotalsSchema,
  durationMs: z.number().int().nullable(),
  generatedAt: isoDateSchema,
});
export type TranslationVersionView = z.infer<typeof translationVersionViewSchema>;

export const translationUsageQuerySchema = z.object({
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
  targetLocale: localeCodeSchema.optional(),
  modelId: z.string().uuid().optional(),
  groupBy: z.enum(['run', 'language', 'model', 'day']).default('language'),
});
export type TranslationUsageQuery = z.infer<typeof translationUsageQuerySchema>;

export const translationUsageRowSchema = z.object({
  key: z.string(),
  completed: nonNegativeInt,
  skipped: nonNegativeInt,
  failed: nonNegativeInt,
  reportedInputTokens: nonNegativeInt,
  reportedOutputTokens: nonNegativeInt,
  estimatedInputTokens: nonNegativeInt,
  estimatedOutputTokens: nonNegativeInt,
  unavailableCount: nonNegativeInt,
  totalDurationMs: nonNegativeInt,
});
export type TranslationUsageRow = z.infer<typeof translationUsageRowSchema>;

// ---- List envelopes --------------------------------------------------------

export const translationRunListSchema = z.object({
  items: z.array(translationRunViewSchema),
  total: nonNegativeInt,
});
export type TranslationRunList = z.infer<typeof translationRunListSchema>;

export const translationRunItemListSchema = z.object({
  items: z.array(translationRunItemViewSchema),
  total: nonNegativeInt,
});
export type TranslationRunItemList = z.infer<typeof translationRunItemListSchema>;

export const translationDocumentListSchema = z.object({
  items: z.array(translationDocumentViewSchema),
  total: nonNegativeInt,
});
export type TranslationDocumentList = z.infer<typeof translationDocumentListSchema>;

export const translationUsageListSchema = z.object({
  rows: z.array(translationUsageRowSchema),
});
export type TranslationUsageList = z.infer<typeof translationUsageListSchema>;

// ---- Error codes -----------------------------------------------------------

export const TRANSLATION_ERROR_CODES = [
  'INVALID_TRANSLATION_INPUT',
  'TRANSLATION_NOT_FOUND',
  'TRANSLATION_ALREADY_RUNNING',
  'RUN_NOT_ACTIVE',
  'RUN_NOT_PAUSED',
  'MODEL_UNAVAILABLE',
  'CAPABILITY_MISMATCH',
  'SOURCE_NOT_TRANSLATABLE',
  'AI_DISABLED',
  'JOB_QUEUE_UNAVAILABLE',
] as const;
export type TranslationErrorCode = (typeof TRANSLATION_ERROR_CODES)[number];
