import { z } from 'zod';

export const transferSourceTypeSchema = z.enum(['wikijs']);
export const transferSourceStatusSchema = z.enum([
  'unverified',
  'healthy',
  'unavailable',
  'disabled',
]);
export const transferRunKindSchema = z.enum([
  'site_export',
  'archive_preview',
  'archive_import',
  'wikijs_source_test',
  'wikijs_preview',
  'wikijs_import',
]);
export const transferRunStatusSchema = z.enum([
  'queued',
  'running',
  'paused',
  'completed',
  'completed_with_warnings',
  'failed',
  'cancelled',
]);
export const transferRunPhaseSchema = z.enum([
  'queued',
  'discovering',
  'validating',
  'planning',
  'downloading',
  'writing_assets',
  'writing_pages',
  'finalizing',
  'completed',
]);
export const transferItemKindSchema = z.enum(['page', 'asset', 'archive_entry']);
export const transferItemActionSchema = z.enum([
  'create',
  'replace',
  'skip',
  'convert',
  'validate',
]);
export const transferItemStatusSchema = z.enum([
  'pending',
  'running',
  'completed',
  'warning',
  'failed',
  'cancelled',
]);
export const transferArtifactKindSchema = z.enum([
  'source_archive',
  'export_archive',
  'run_report',
]);
export const transferArtifactStatusSchema = z.enum([
  'uploading',
  'ready',
  'expired',
  'deleted',
  'failed',
]);
export const transferConflictStrategySchema = z.enum(['skip', 'replace']);

export type TransferSourceType = z.infer<typeof transferSourceTypeSchema>;
export type TransferRunKind = z.infer<typeof transferRunKindSchema>;
export type TransferRunStatus = z.infer<typeof transferRunStatusSchema>;
export type TransferRunPhase = z.infer<typeof transferRunPhaseSchema>;
export type TransferItemKind = z.infer<typeof transferItemKindSchema>;
export type TransferItemAction = z.infer<typeof transferItemActionSchema>;
export type TransferItemStatus = z.infer<typeof transferItemStatusSchema>;
export type TransferArtifactKind = z.infer<typeof transferArtifactKindSchema>;

const isoDateSchema = z.string().datetime();
const nullableIsoDateSchema = isoDateSchema.nullable();
const nonNegativeInt = z.number().int().nonnegative();

export const transferOptionsSchema = z.object({
  conflictStrategy: transferConflictStrategySchema.default('skip'),
});
export type TransferOptions = z.infer<typeof transferOptionsSchema>;

export const transferSourceCreateSchema = z.object({
  type: transferSourceTypeSchema.default('wikijs'),
  name: z.string().trim().min(1).max(100),
  baseUrl: z.string().url().max(2048),
  apiToken: z.string().min(1).max(4096),
  allowPrivateNetwork: z.boolean().default(false),
  enabled: z.boolean().default(true),
});
export type TransferSourceCreate = z.infer<typeof transferSourceCreateSchema>;

export const transferSourceUpdateSchema = transferSourceCreateSchema
  .omit({ type: true, apiToken: true })
  .partial()
  .extend({ apiToken: z.string().min(1).max(4096).optional() });
export type TransferSourceUpdate = z.infer<typeof transferSourceUpdateSchema>;

export const transferSourceViewSchema = z.object({
  id: z.string().uuid(),
  type: transferSourceTypeSchema,
  name: z.string(),
  baseUrl: z.string(),
  allowPrivateNetwork: z.boolean(),
  hasCredentials: z.boolean(),
  status: transferSourceStatusSchema,
  lastCheckedAt: nullableIsoDateSchema,
  lastErrorCode: z.string().nullable(),
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
});
export type TransferSourceView = z.infer<typeof transferSourceViewSchema>;

export const transferArtifactReserveSchema = z.object({
  kind: z.literal('source_archive'),
  filename: z.string().trim().min(1).max(255),
  sizeBytes: z.number().int().positive().optional(),
});
export type TransferArtifactReserve = z.infer<typeof transferArtifactReserveSchema>;

export const transferArtifactViewSchema = z.object({
  id: z.string().uuid(),
  kind: transferArtifactKindSchema,
  status: transferArtifactStatusSchema,
  runId: z.string().uuid().nullable(),
  originalFilename: z.string().nullable(),
  contentType: z.string(),
  sizeBytes: nonNegativeInt,
  contentHash: z.string().nullable(),
  contentUrl: z.string().nullable(),
  expiresAt: isoDateSchema,
  createdAt: isoDateSchema,
  readyAt: nullableIsoDateSchema,
  deletedAt: nullableIsoDateSchema,
});
export type TransferArtifactView = z.infer<typeof transferArtifactViewSchema>;

export const transferRunCreateSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('site_export') }),
  z.object({
    kind: z.literal('archive_preview'),
    sourceArtifactId: z.string().uuid(),
    options: transferOptionsSchema.default({ conflictStrategy: 'skip' }),
  }),
  z.object({ kind: z.literal('archive_import'), previewRunId: z.string().uuid() }),
  z.object({ kind: z.literal('wikijs_source_test'), sourceId: z.string().uuid() }),
  z.object({
    kind: z.literal('wikijs_preview'),
    sourceId: z.string().uuid(),
    options: transferOptionsSchema.default({ conflictStrategy: 'skip' }),
  }),
  z.object({ kind: z.literal('wikijs_import'), previewRunId: z.string().uuid() }),
]);
export type TransferRunCreate = z.infer<typeof transferRunCreateSchema>;

export const transferRunViewSchema = z.object({
  id: z.string().uuid(),
  kind: transferRunKindSchema,
  status: transferRunStatusSchema,
  phase: transferRunPhaseSchema,
  actorUserId: z.string().uuid().nullable(),
  sourceId: z.string().uuid().nullable(),
  sourceArtifactId: z.string().uuid().nullable(),
  previewRunId: z.string().uuid().nullable(),
  options: z.record(z.unknown()),
  sourceFingerprint: z.string().nullable(),
  totalItems: nonNegativeInt,
  processedItems: nonNegativeInt,
  createdItems: nonNegativeInt,
  replacedItems: nonNegativeInt,
  skippedItems: nonNegativeInt,
  convertedItems: nonNegativeInt,
  warningItems: nonNegativeInt,
  failedItems: nonNegativeInt,
  currentItem: z.string().nullable(),
  cancelRequested: z.boolean(),
  pauseRequested: z.boolean(),
  errorCode: z.string().nullable(),
  errorMessage: z.string().nullable(),
  errorDetail: z.string().nullable(),
  reportArtifactId: z.string().uuid().nullable(),
  queuedAt: isoDateSchema,
  startedAt: nullableIsoDateSchema,
  finishedAt: nullableIsoDateSchema,
  expiresAt: isoDateSchema,
  canCancel: z.boolean(),
  canRetry: z.boolean(),
  canPause: z.boolean(),
  canResume: z.boolean(),
});
export type TransferRunView = z.infer<typeof transferRunViewSchema>;

export const transferRunAcceptedSchema = z.object({
  id: z.string().uuid(),
  status: z.literal('queued'),
});
export type TransferRunAccepted = z.infer<typeof transferRunAcceptedSchema>;

export const transferItemViewSchema = z.object({
  id: z.string().uuid(),
  runId: z.string().uuid(),
  kind: transferItemKindSchema,
  sourceKey: z.string(),
  displayName: z.string(),
  targetKey: z.string().nullable(),
  action: transferItemActionSchema,
  status: transferItemStatusSchema,
  bytesTotal: nonNegativeInt.nullable(),
  bytesProcessed: nonNegativeInt,
  warningCode: z.string().nullable(),
  warningMessage: z.string().nullable(),
  errorCode: z.string().nullable(),
  errorMessage: z.string().nullable(),
  metadata: z.record(z.unknown()),
  attempts: nonNegativeInt,
  startedAt: nullableIsoDateSchema,
  finishedAt: nullableIsoDateSchema,
});
export type TransferItemView = z.infer<typeof transferItemViewSchema>;

export const transferRunQuerySchema = z.object({
  kind: transferRunKindSchema.optional(),
  status: transferRunStatusSchema.optional(),
  sourceId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});
export type TransferRunQuery = z.infer<typeof transferRunQuerySchema>;
export const transferItemQuerySchema = z.object({
  kind: transferItemKindSchema.optional(),
  status: transferItemStatusSchema.optional(),
  action: transferItemActionSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});
export type TransferItemQuery = z.infer<typeof transferItemQuerySchema>;

export const transferRunListSchema = z.object({
  items: z.array(transferRunViewSchema),
  total: nonNegativeInt,
});
export type TransferRunList = z.infer<typeof transferRunListSchema>;
export const transferItemListSchema = z.object({
  items: z.array(transferItemViewSchema),
  total: nonNegativeInt,
});
export type TransferItemList = z.infer<typeof transferItemListSchema>;

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
export const portableFileSchema = z.object({
  entry: z.string().min(1),
  sha256: sha256Schema,
  sizeBytes: nonNegativeInt,
});
export const portablePageSchema = z.object({
  id: z.string().min(1),
  entry: z.string().min(1),
  path: z.string().min(1),
  locale: z.string().min(1),
  title: z.string().min(1),
  contentType: z.literal('text/markdown'),
  contentHash: sha256Schema,
  sizeBytes: nonNegativeInt,
  revisionId: z.string().min(1),
  publishedAt: nullableIsoDateSchema,
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
  assetIds: z.array(sha256Schema),
});
export const portableAssetSchema = z.object({
  id: sha256Schema,
  entry: z.string().min(1),
  contentHash: sha256Schema,
  contentType: z.enum(['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml']),
  sizeBytes: nonNegativeInt,
  sourceAssetId: z.string().min(1).optional(),
});
export const portableArchiveManifestSchema = z
  .object({
    format: z.literal('next-wiki-portable'),
    version: z.literal(1),
    createdAt: isoDateSchema,
    source: z.object({
      instanceId: z.string().min(1),
      product: z.literal('next-wiki'),
      version: z.string().min(1),
    }),
    snapshot: z.object({
      spaceSlug: z.string().min(1),
      capturedAt: isoDateSchema,
    }),
    counts: z.object({ pages: nonNegativeInt, assets: nonNegativeInt }),
    pages: z.array(portablePageSchema),
    assets: z.array(portableAssetSchema),
    files: z.array(portableFileSchema),
  })
  .superRefine((manifest, ctx) => {
    if (manifest.counts.pages !== manifest.pages.length) {
      ctx.addIssue({ code: 'custom', path: ['counts', 'pages'], message: 'Page count mismatch' });
    }
    if (manifest.counts.assets !== manifest.assets.length) {
      ctx.addIssue({ code: 'custom', path: ['counts', 'assets'], message: 'Asset count mismatch' });
    }
  });
export type PortableArchiveManifest = z.infer<typeof portableArchiveManifestSchema>;

export const TRANSFER_ERROR_CODES = [
  'INVALID_TRANSFER_OPTIONS',
  'INVALID_ARCHIVE',
  'TRANSFER_NOT_FOUND',
  'TRANSFER_CONFLICT',
  'TRANSFER_ALREADY_RUNNING',
  'SOURCE_IN_USE',
  'ARTIFACT_IN_USE',
  'ARTIFACT_NOT_UPLOADABLE',
  'ARCHIVE_TOO_LARGE',
  'INVALID_ARCHIVE_TYPE',
  'UNSUPPORTED_ARCHIVE_VERSION',
  'UNSUPPORTED_SOURCE_CONTENT',
  'SOURCE_UNAVAILABLE',
  'SOURCE_INVALID_RESPONSE',
  'SOURCE_TIMEOUT',
  'RUN_NOT_ACTIVE',
] as const;
