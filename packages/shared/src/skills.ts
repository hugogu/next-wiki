import { z } from 'zod';

/**
 * Agent Skills (028) — shared DTOs for the admin surface.
 *
 * A skill is a reusable, file-based instruction package that teaches the
 * assistant how to perform a recurring wiki task. Skills carry no authority of
 * their own: what a turn may actually do is still decided by the initiating
 * user's permissions and the configured review policy.
 */

// ---- Identity and limits ----------------------------------------------------

/** Canonical skill identity is the `name` declared in the instruction file's
 * frontmatter, not the directory it was found in. */
export const skillNameSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Use lowercase words separated by single hyphens');
export type SkillName = z.infer<typeof skillNameSchema>;

export const skillDescriptionSchema = z.string().trim().min(1).max(1_024);

/** Relative to the package root. Absolute paths and `.`/`..` segments are
 * rejected before any storage or filesystem access. */
export const skillFilePathSchema = z
  .string()
  .min(1)
  .max(255)
  .refine((value) => !value.startsWith('/'), 'Path must be relative to the skill package')
  .refine(
    (value) => !value.split('/').some((segment) => segment === '.' || segment === '..'),
    'Path must not contain "." or ".." segments',
  )
  .refine((value) => !value.includes('\\'), 'Use forward slashes');

/**
 * Bounds on skill discovery and storage. These are the loading contract the
 * feature spec owes constitution P10 in exchange for reading skills off the
 * filesystem, and they are what keeps a rescan a synchronous request rather
 * than a background job.
 */
export const SKILL_LIMITS = {
  /** Packages considered in one directory scan. */
  maxPackagesPerScan: 100,
  /** Files per package. */
  maxFilesPerPackage: 16,
  /** Bytes per file that may be viewed or edited inline. */
  maxFileBytes: 64 * 1024,
  /** Total bytes of one package. */
  maxPackageBytes: 1024 * 1024,
  /** Total skill content loaded into one conversation turn. */
  maxTurnContentBytes: 96 * 1024,
} as const;

// ---- Enums (mirror db/schema/enums.ts) --------------------------------------

export const skillSourceSchema = z.enum(['builtin', 'directory', 'managed']);
export type SkillSource = z.infer<typeof skillSourceSchema>;

export const skillValidationStateSchema = z.enum(['valid', 'invalid']);
export type SkillValidationState = z.infer<typeof skillValidationStateSchema>;

export const skillFileKindSchema = z.enum(['instruction', 'reference', 'script']);
export type SkillFileKind = z.infer<typeof skillFileKindSchema>;

/** Why a candidate package was not registered. Every value maps to a specific,
 * actionable admin-facing message. */
export const skillRejectionReasonSchema = z.enum([
  'missing_instruction_file',
  'invalid_frontmatter',
  'duplicate_name',
  'too_large',
  'too_many_files',
  'path_escape',
  'unreadable',
]);
export type SkillRejectionReason = z.infer<typeof skillRejectionReasonSchema>;

// ---- Views ------------------------------------------------------------------

export const skillFileViewSchema = z.object({
  path: z.string(),
  kind: skillFileKindSchema,
  contentType: z.string(),
  byteSize: z.number().int().nonnegative(),
  /** False for binary files and files above `maxFileBytes`. Such files are
   * listed by name, type, and size but cannot be opened inline. */
  viewable: z.boolean(),
  /** Optimistic-concurrency token; null for read-only directory sources. */
  revision: z.number().int().positive().nullable(),
});
export type SkillFileView = z.infer<typeof skillFileViewSchema>;

export const skillFileContentSchema = skillFileViewSchema.extend({
  content: z.string(),
  editable: z.boolean(),
});
export type SkillFileContent = z.infer<typeof skillFileContentSchema>;

export const skillSummarySchema = z.object({
  name: skillNameSchema,
  description: z.string(),
  source: skillSourceSchema,
  /** Directory-sourced skills are read-only: the mount is never written to. */
  editable: z.boolean(),
  /** A built-in skill whose shipped content has been overridden. */
  overridden: z.boolean(),
  enabled: z.boolean(),
  validationState: skillValidationStateSchema,
  validationError: z.string().nullable(),
  fileCount: z.number().int().nonnegative(),
  lastUsedAt: z.string().nullable(),
});
export type SkillSummary = z.infer<typeof skillSummarySchema>;

export const skillDetailSchema = skillSummarySchema.extend({
  files: z.array(skillFileViewSchema),
});
export type SkillDetail = z.infer<typeof skillDetailSchema>;

export const skillRejectionSchema = z.object({
  reason: skillRejectionReasonSchema,
  /** Specific, actionable explanation. Never contains a path outside the skills
   * root, a credential, or stack detail. */
  detail: z.string(),
  /** Declared name when it could be read. */
  name: z.string().nullable(),
  origin: z.object({ directory: z.string().nullable() }),
  conflictsWith: z
    .object({ name: z.string(), source: skillSourceSchema })
    .nullable()
    .optional(),
});
export type SkillRejection = z.infer<typeof skillRejectionSchema>;

export const skillDirectoryStatusSchema = z.object({
  configured: z.boolean(),
  basePath: z.string().nullable(),
  hostPath: z.string().nullable(),
  readable: z.boolean(),
  /** Informational message when the directory is unconfigured, missing, or
   * unreadable. Its presence is not an error. */
  notice: z.string().nullable(),
  lastScannedAt: z.string().nullable(),
});
export type SkillDirectoryStatus = z.infer<typeof skillDirectoryStatusSchema>;

export const skillCatalogueSchema = z.object({
  skills: z.array(skillSummarySchema),
  rejected: z.array(skillRejectionSchema),
  directory: skillDirectoryStatusSchema,
});
export type SkillCatalogue = z.infer<typeof skillCatalogueSchema>;

// ---- Requests ---------------------------------------------------------------

export const createSkillInputSchema = z.object({
  name: skillNameSchema,
  description: skillDescriptionSchema,
});
export type CreateSkillInput = z.infer<typeof createSkillInputSchema>;

export const updateSkillInputSchema = z.object({
  enabled: z.boolean(),
});
export type UpdateSkillInput = z.infer<typeof updateSkillInputSchema>;

export const writeSkillFileInputSchema = z.object({
  content: z.string().max(SKILL_LIMITS.maxFileBytes),
  /** The revision the client read. Mandatory on an existing file so a
   * concurrent edit is rejected rather than silently overwritten. */
  revision: z.number().int().positive().optional(),
});
export type WriteSkillFileInput = z.infer<typeof writeSkillFileInputSchema>;

// ---- Domain error codes -----------------------------------------------------

export const skillErrorCodeSchema = z.enum([
  'SKILL_NAME_TAKEN',
  'SKILL_NOT_FOUND',
  'SKILL_READ_ONLY',
  'SKILL_INVALID',
  'SKILL_PATH_INVALID',
  'SKILL_FILE_NOT_FOUND',
  'SKILL_FILE_CONFLICT',
  'SKILL_FILE_NOT_VIEWABLE',
  'SKILL_FILE_TOO_LARGE',
  'SKILL_DISABLED',
]);
export type SkillErrorCode = z.infer<typeof skillErrorCodeSchema>;
