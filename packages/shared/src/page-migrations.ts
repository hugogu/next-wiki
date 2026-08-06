import { z } from 'zod';
import { pathSchema, pageVisibilitySchema } from './pages';

export const migrationSpaceKindSchema = z.enum(['wiki', 'generated']);
export const crossSpaceMigrationStatusSchema = z.enum([
  'previewed', 'queued', 'running', 'completed', 'completed_with_warnings', 'failed', 'cancelled',
]);
export const crossSpaceMigrationItemStatusSchema = z.enum([
  'pending', 'running', 'moved', 'excluded', 'conflicted', 'failed', 'cancelled',
]);

export const spaceMigrationSelectionSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('page'), pageId: z.string().uuid() }),
  z.object({ kind: z.literal('folder'), sourceSpaceId: z.string().uuid(), pathPrefix: pathSchema }),
]);

export const spaceMigrationPreviewInputSchema = z.object({
  selection: spaceMigrationSelectionSchema,
  destinationSpaceId: z.string().uuid(),
  destinationPathPrefix: pathSchema.optional(),
  visibility: pageVisibilitySchema.optional(),
  adaptOkf: z.boolean().default(true),
});
export type SpaceMigrationPreviewInput = z.infer<typeof spaceMigrationPreviewInputSchema>;

export const spaceMigrationConfirmInputSchema = z.object({
  previewId: z.string().uuid(),
  fingerprint: z.string().min(16).max(128),
});
export type SpaceMigrationConfirmInput = z.infer<typeof spaceMigrationConfirmInputSchema>;

export const spaceMigrationItemSchema = z.object({
  id: z.string().uuid(),
  pageId: z.string().uuid(),
  sourcePath: z.string(),
  destinationPath: z.string(),
  locale: z.string(),
  status: crossSpaceMigrationItemStatusSchema,
  warning: z.string().nullable(),
  failure: z.string().nullable(),
  canonicalUrl: z.string().nullable().optional(),
});
export type SpaceMigrationItem = z.infer<typeof spaceMigrationItemSchema>;

export const spaceMigrationPreviewSchema = z.object({
  id: z.string().uuid(),
  fingerprint: z.string(),
  status: z.literal('previewed'),
  sourceSpace: z.object({ id: z.string().uuid(), slug: z.string(), kind: migrationSpaceKindSchema }),
  destinationSpace: z.object({ id: z.string().uuid(), slug: z.string(), kind: migrationSpaceKindSchema }),
  items: z.array(spaceMigrationItemSchema),
  warningCount: z.number().int().nonnegative(),
  expiresAt: z.string().datetime(),
});
export type SpaceMigrationPreview = z.infer<typeof spaceMigrationPreviewSchema>;

export const spaceMigrationOperationSchema = z.object({
  id: z.string().uuid(),
  status: crossSpaceMigrationStatusSchema,
  sourceSpaceId: z.string().uuid(),
  destinationSpaceId: z.string().uuid(),
  totalItems: z.number().int().nonnegative(),
  movedItems: z.number().int().nonnegative(),
  warningCount: z.number().int().nonnegative(),
  failedItems: z.number().int().nonnegative(),
  cancellationRequested: z.boolean(),
  failure: z.string().nullable(),
  createdAt: z.string().datetime(),
  startedAt: z.string().datetime().nullable(),
  completedAt: z.string().datetime().nullable(),
});
export type SpaceMigrationOperation = z.infer<typeof spaceMigrationOperationSchema>;

export const spaceMigrationItemsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().uuid().optional(),
});

export const spaceMigrationErrorCodes = [
  'MIGRATION_PREVIEW_NOT_FOUND', 'STALE_MIGRATION_PREVIEW', 'MIGRATION_ALREADY_RUNNING',
  'MIGRATION_CONFLICT', 'MIGRATION_SELECTION_INVALID', 'MIGRATION_DESTINATION_INVALID',
  'RAW_SPACE_IMMUTABLE', 'SPACE_UNAVAILABLE',
] as const;
export type SpaceMigrationErrorCode = (typeof spaceMigrationErrorCodes)[number];
