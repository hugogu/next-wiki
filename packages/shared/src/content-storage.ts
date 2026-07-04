import { z } from 'zod';

// ---- Enums (mirror db/schema/enums.ts) -------------------------------------

export const storageBackendTypeSchema = z.enum(['database', 'local', 's3', 'git']);
export type StorageBackendType = z.infer<typeof storageBackendTypeSchema>;

/** Backends that can act as the authoritative content store (Git is export-only). */
export const contentStoreTypeSchema = z.enum(['database', 'local', 's3']);
export type ContentStoreType = z.infer<typeof contentStoreTypeSchema>;

export const storageBackendPurposeSchema = z.enum(['primary', 'git_export']);
export type StorageBackendPurpose = z.infer<typeof storageBackendPurposeSchema>;

export const storageReplicaStateSchema = z.enum([
  'disabled',
  'backfilling',
  'enabled',
  'degraded',
  'deleting',
]);
export type StorageReplicaState = z.infer<typeof storageReplicaStateSchema>;

export const contentAssetKindSchema = z.enum(['image']);
export type ContentAssetKind = z.infer<typeof contentAssetKindSchema>;

export const migrationStatusSchema = z.enum([
  'pending',
  'copying',
  'verifying',
  'completed',
  'failed',
  'aborted',
]);
export type MigrationStatus = z.infer<typeof migrationStatusSchema>;

// ---- Image upload ----------------------------------------------------------

/**
 * Image content types accepted for uploads and import. The raster types are
 * verified by magic bytes; SVG (vector) is accepted only after being sanitized
 * (script / event-handler / external-reference stripping) on the way in and is
 * served back under a strict `sandbox` CSP so direct navigation cannot execute
 * active content (see plan D3 / research R12).
 */
export const imageContentTypeSchema = z.enum([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/svg+xml',
]);
export type ImageContentType = z.infer<typeof imageContentTypeSchema>;

export const IMAGE_CONTENT_TYPES: readonly ImageContentType[] = imageContentTypeSchema.options;

/** Internal result returned after storing an uploaded image asset. */
export const assetUploadResultSchema = z.object({
  id: z.string(),
  url: z.string(),
  contentType: imageContentTypeSchema,
  sizeBytes: z.number().int().nonnegative(),
});
export type AssetUploadResult = z.infer<typeof assetUploadResultSchema>;

export const publicAssetResourceSchema = z.object({
  id: z.string().uuid(),
  contentType: imageContentTypeSchema,
  sizeBytes: z.number().int().nonnegative(),
  url: z.string(),
  markdown: z.string(),
  createdAt: z.string(),
});
export type PublicAssetResource = z.infer<typeof publicAssetResourceSchema>;

export const publicAssetUploadResultSchema = publicAssetResourceSchema;
export type PublicAssetUploadResult = z.infer<typeof publicAssetUploadResultSchema>;

// ---- Backend configuration (per-type, non-secret) --------------------------
//
// Secret fields (S3 secret access key, Git token) are NEVER part of these
// shapes; they are submitted via a separate write-only `secret` field and
// stored encrypted. URL fields reject embedded credentials.

const noCredentialsInUrl = (value: string) => !/\/\/[^/@]*@/.test(value);
const credentialsMessage = 'URL must not contain embedded credentials';

export const databaseBackendConfigSchema = z.object({});
export type DatabaseBackendConfig = z.infer<typeof databaseBackendConfigSchema>;

export const localBackendConfigSchema = z.object({
  basePath: z.string().min(1),
});
export type LocalBackendConfig = z.infer<typeof localBackendConfigSchema>;

export const s3BackendConfigSchema = z.object({
  endpoint: z.string().url().refine(noCredentialsInUrl, credentialsMessage).optional(),
  region: z.string().min(1),
  bucket: z.string().min(1),
  prefix: z.string().optional(),
  accessKeyId: z.string().min(1),
});
export type S3BackendConfig = z.infer<typeof s3BackendConfigSchema>;

const gitRemoteUrlSchema = z
  .string()
  .min(1)
  .refine(
    (value) =>
      (/^https:\/\/\S+$/i.test(value) && noCredentialsInUrl(value)) ||
      /^ssh:\/\/\S+$/i.test(value) ||
      /^[\w.-]+@[\w.-]+:[^\s]+$/.test(value),
    'Use an HTTPS or SSH Git remote without embedded credentials',
  );

export const gitAuthModeSchema = z.enum(['https_token', 'ssh']);
export type GitAuthMode = z.infer<typeof gitAuthModeSchema>;

export const gitBackendConfigSchema = z.object({
  remoteUrl: gitRemoteUrlSchema,
  branch: z
    .string()
    .min(1)
    .regex(/^(?!-)(?!.*\.\.)(?!.*[~^:?*[\]\\\s]).+$/, 'Invalid Git branch name'),
  assetsDir: z
    .string()
    .min(1)
    .regex(/^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$)).+$/, 'Assets directory must be relative'),
  username: z.string().optional(),
  authMode: gitAuthModeSchema,
  publicKey: z.string().optional(),
  fingerprint: z.string().optional(),
  // Sync triggers. Defaults keep older stored configs backward-compatible.
  autoSyncOnPublish: z.boolean().default(true),
  scheduledSyncEnabled: z.boolean().default(false),
  scheduledSyncIntervalMinutes: z.number().int().min(5).max(1440).default(60),
});
export type GitBackendConfig = z.infer<typeof gitBackendConfigSchema>;

export const gitExportUpsertSchema = z.object({
  enabled: z.boolean(),
  config: gitBackendConfigSchema,
  secret: z.string().min(1).optional(),
});
// Input type: the defaulted sync-trigger fields are optional on the request and
// resolved to their defaults when the config is re-parsed server-side.
export type GitExportUpsert = z.input<typeof gitExportUpsertSchema>;

export const gitSshKeyResultSchema = z.object({
  publicKey: z.string(),
  fingerprint: z.string(),
});
export type GitSshKeyResult = z.infer<typeof gitSshKeyResultSchema>;

export const gitExportRunResultSchema = z.object({
  queued: z.boolean(),
});
export type GitExportRunResult = z.infer<typeof gitExportRunResultSchema>;

// ---- Backend view (returned to admin UI; never includes secrets) -----------

export const storageBackendViewSchema = z.object({
  id: z.string(),
  type: storageBackendTypeSchema,
  purpose: storageBackendPurposeSchema,
  isActive: z.boolean(),
  replicaState: storageReplicaStateSchema,
  isReadPreferred: z.boolean(),
  syncStartedAt: z.string().nullable(),
  syncCompletedAt: z.string().nullable(),
  lastSyncAt: z.string().nullable(),
  lastError: z.string().nullable(),
  config: z.record(z.unknown()),
  hasSecret: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type StorageBackendView = z.infer<typeof storageBackendViewSchema>;

// ---- Backend configuration write (admin) -----------------------------------
//
// Per-type discriminated union so the route returns INVALID_CONFIG (400) on a
// shape mismatch. `secret` is write-only (S3 secret access key); it is never
// echoed back. Purpose is `primary` for authoritative backends in this slice
// (Git export is configured via its own endpoint).

export const storageBackendUpsertSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('database'),
    config: databaseBackendConfigSchema,
  }),
  z.object({
    type: z.literal('local'),
    config: localBackendConfigSchema,
  }),
  z.object({
    type: z.literal('s3'),
    config: s3BackendConfigSchema,
    secret: z.string().min(1).optional(),
  }),
]);
export type StorageBackendUpsert = z.infer<typeof storageBackendUpsertSchema>;

export const storageBackendDisableSchema = z.object({
  retainData: z.boolean(),
});
export const storageBackendEnableSchema = z.object({
  syncExisting: z.boolean(),
});
export const storageReadBackendSchema = z.object({
  backendId: z.string().uuid().nullable(),
});

/** Body for an ephemeral connection check: either a saved backend or ad-hoc config. */
export const backendCheckSchema = z
  .object({
    backendId: z.string().uuid().optional(),
    type: contentStoreTypeSchema.optional(),
    config: z.record(z.unknown()).optional(),
    secret: z.string().optional(),
  })
  .refine((d) => Boolean(d.backendId) || Boolean(d.type && d.config), {
    message: 'Provide either backendId or type with config',
  });
export type BackendCheckInput = z.infer<typeof backendCheckSchema>;

export const backendCheckResultSchema = z.object({
  ok: z.boolean(),
  detail: z.string().optional(),
});
export type BackendCheckResult = z.infer<typeof backendCheckResultSchema>;

export const replicaSyncStatusSchema = z.object({
  backendId: z.string().uuid(),
  backendType: contentStoreTypeSchema,
  state: storageReplicaStateSchema,
  totalItems: z.number().int().nonnegative(),
  completedItems: z.number().int().nonnegative(),
  failedItems: z.number().int().nonnegative(),
  lastError: z.string().nullable(),
});
export type ReplicaSyncStatus = z.infer<typeof replicaSyncStatusSchema>;

// ---- Migration view --------------------------------------------------------

export const migrationViewSchema = z.object({
  id: z.string(),
  status: migrationStatusSchema,
  abortRequested: z.boolean(),
  totalItems: z.number().int().nonnegative(),
  copiedItems: z.number().int().nonnegative(),
  verifiedItems: z.number().int().nonnegative(),
  errorMessage: z.string().nullable(),
  startedAt: z.string().nullable(),
  finishedAt: z.string().nullable(),
});
export type MigrationView = z.infer<typeof migrationViewSchema>;

// ---- Migration & cleanup requests ------------------------------------------

export const migrationStartSchema = z.object({
  targetBackendId: z.string().uuid(),
  confirmOverwrite: z.boolean().optional(),
});
export type MigrationStartInput = z.infer<typeof migrationStartSchema>;

export const migrationListSchema = z.object({ items: z.array(migrationViewSchema) });
export type MigrationList = z.infer<typeof migrationListSchema>;

export const cleanupStatusSchema = z.enum(['pending', 'running', 'completed', 'failed']);
export type CleanupStatus = z.infer<typeof cleanupStatusSchema>;

export const cleanupStartSchema = z.object({
  backendId: z.string().uuid(),
  confirm: z.literal(true),
});
export type CleanupStartInput = z.infer<typeof cleanupStartSchema>;

export const cleanupJobViewSchema = z.object({
  jobId: z.string(),
  backendId: z.string(),
  status: cleanupStatusSchema,
  totalItems: z.number().int().nonnegative(),
  deletedItems: z.number().int().nonnegative(),
  errorMessage: z.string().nullable(),
  startedAt: z.string().nullable(),
  finishedAt: z.string().nullable(),
});
export type CleanupJobView = z.infer<typeof cleanupJobViewSchema>;

// ---- Storage overview (GET /api/storage) -----------------------------------

export const storageDeploymentInfoSchema = z.object({
  database: z.object({
    engine: z.literal('PostgreSQL'),
    host: z.string(),
    port: z.string(),
    database: z.string(),
    username: z.string(),
    ssl: z.boolean(),
  }),
  local: z.object({
    containerPath: z.string(),
    hostPath: z.string().nullable(),
  }),
});
export type StorageDeploymentInfo = z.infer<typeof storageDeploymentInfoSchema>;

export const storageOverviewSchema = z.object({
  active: storageBackendViewSchema,
  authoritative: storageBackendViewSchema,
  preferredReadBackend: storageBackendViewSchema.nullable(),
  backends: z.array(storageBackendViewSchema),
  gitExport: storageBackendViewSchema.nullable(),
  migration: migrationViewSchema.nullable(),
  deployment: storageDeploymentInfoSchema,
});
export type StorageOverview = z.infer<typeof storageOverviewSchema>;
