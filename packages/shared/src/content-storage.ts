import { z } from 'zod';

// ---- Enums (mirror db/schema/enums.ts) -------------------------------------

export const storageBackendTypeSchema = z.enum(['database', 'local', 's3', 'git']);
export type StorageBackendType = z.infer<typeof storageBackendTypeSchema>;

/** Backends that can act as the authoritative content store (Git is export-only). */
export const contentStoreTypeSchema = z.enum(['database', 'local', 's3']);
export type ContentStoreType = z.infer<typeof contentStoreTypeSchema>;

export const storageBackendPurposeSchema = z.enum(['primary', 'git_export']);
export type StorageBackendPurpose = z.infer<typeof storageBackendPurposeSchema>;

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
 * Raster image content types accepted for in-editor uploads. SVG is excluded:
 * an SVG served same-origin can execute active content on direct navigation
 * (see plan D3 / research R12).
 */
export const imageContentTypeSchema = z.enum([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
]);
export type ImageContentType = z.infer<typeof imageContentTypeSchema>;

export const IMAGE_CONTENT_TYPES: readonly ImageContentType[] = imageContentTypeSchema.options;

/** Result returned by `POST /api/assets` and consumed by the editor. */
export const assetUploadResultSchema = z.object({
  id: z.string(),
  url: z.string(),
  contentType: imageContentTypeSchema,
  sizeBytes: z.number().int().nonnegative(),
});
export type AssetUploadResult = z.infer<typeof assetUploadResultSchema>;

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

export const gitBackendConfigSchema = z.object({
  remoteUrl: z.string().url().refine(noCredentialsInUrl, credentialsMessage),
  branch: z.string().min(1),
  assetsDir: z.string().optional(),
  username: z.string().optional(),
});
export type GitBackendConfig = z.infer<typeof gitBackendConfigSchema>;

// ---- Backend view (returned to admin UI; never includes secrets) -----------

export const storageBackendViewSchema = z.object({
  id: z.string(),
  type: storageBackendTypeSchema,
  purpose: storageBackendPurposeSchema,
  isActive: z.boolean(),
  config: z.record(z.unknown()),
  hasSecret: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type StorageBackendView = z.infer<typeof storageBackendViewSchema>;

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
