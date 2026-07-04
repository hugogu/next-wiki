import { z } from 'zod';

export const slugSchema = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[a-z0-9][a-z0-9-]*$/, {
    message: 'Slug must be lowercase letters, numbers, and hyphens, starting with a letter or number',
  });

const pathRegex = /^[a-z0-9]([a-z0-9-/]*[a-z0-9])?$/;

export const pathSchema = z
  .string()
  .min(1)
  .max(200)
  .regex(pathRegex, {
    message: 'Path must be lowercase letters, numbers, hyphens and slashes, with no leading/trailing/consecutive slashes',
  })
  .refine((value) => !value.includes('//'), {
    message: 'Path cannot contain consecutive slashes',
  });

export const createPageInputSchema = z.object({
  path: pathSchema,
  title: z.string().min(1).max(200),
  contentSource: z.string().min(1),
});
export type CreatePageInput = z.infer<typeof createPageInputSchema>;

export const newDraftInputSchema = z.object({
  path: pathSchema,
  title: z.string().min(1).max(200),
  contentSource: z.string().min(1),
});
export type NewDraftInput = z.infer<typeof newDraftInputSchema>;

export const newDraftBodySchema = z.object({
  title: z.string().min(1).max(200),
  contentSource: z.string().min(1),
});
export type NewDraftBody = z.infer<typeof newDraftBodySchema>;

export const pagePathInputSchema = z.object({
  path: z.string(),
});

export const revisionInputSchema = z.object({
  path: z.string(),
  version: z.number().int().min(1),
});

export const updatePagePropertiesSchema = z.object({
  path: pathSchema,
});
export type UpdatePagePropertiesInput = z.infer<typeof updatePagePropertiesSchema>;

export const publicPageStatusSchema = z.enum(['draft', 'published', 'deleted']);
export type PublicPageStatus = z.infer<typeof publicPageStatusSchema>;

export const publicRevisionStatusSchema = z.enum(['draft', 'published']);
export type PublicRevisionStatus = z.infer<typeof publicRevisionStatusSchema>;

export const publicAuthorSchema = z.object({
  id: z.string().uuid().nullable(),
  displayName: z.string().nullable(),
});
export type PublicAuthor = z.infer<typeof publicAuthorSchema>;

export const publicRevisionSummarySchema = z.object({
  id: z.string().uuid(),
  pageId: z.string().uuid(),
  version: z.number().int().min(1),
  status: publicRevisionStatusSchema,
  contentType: z.literal('text/markdown'),
  contentHash: z.string(),
  author: publicAuthorSchema,
  createdAt: z.string(),
  publishedAt: z.string().nullable(),
  canPublish: z.boolean(),
});
export type PublicRevisionSummary = z.infer<typeof publicRevisionSummarySchema>;

export const publicRevisionResourceSchema = publicRevisionSummarySchema.extend({
  contentSource: z.string().optional(),
});
export type PublicRevisionResource = z.infer<typeof publicRevisionResourceSchema>;

export const publicPageIncludeValues = ['latestRevision', 'publishedRevision'] as const;
export const publicPageIncludeSchema = z.enum(publicPageIncludeValues);
export type PublicPageInclude = z.infer<typeof publicPageIncludeSchema>;

/** Parses a comma-separated `include` query param into a de-duplicated array. */
export const publicIncludeQuerySchema = z
  .string()
  .optional()
  .transform((value) =>
    value
      ? Array.from(new Set(value.split(',').map((part) => part.trim()).filter(Boolean)))
      : [],
  )
  .pipe(z.array(publicPageIncludeSchema));

export const publicPageResourceSchema = z.object({
  id: z.string().uuid(),
  spaceSlug: z.string(),
  path: pathSchema,
  locale: z.string(),
  title: z.string(),
  contentSource: z.string().optional(),
  status: publicPageStatusSchema,
  author: publicAuthorSchema,
  latestRevision: publicRevisionSummarySchema.nullable().optional(),
  publishedRevision: publicRevisionSummarySchema.nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  links: z.object({
    self: z.string(),
    byPath: z.string(),
    revisions: z.string(),
    drafts: z.string(),
  }),
});
export type PublicPageResource = z.infer<typeof publicPageResourceSchema>;

export const publicPageListQuerySchema = z.object({
  status: z.enum(['published', 'draft', 'all', 'deleted']).default('published'),
  q: z.string().min(1).max(200).optional(),
  path: pathSchema.optional(),
  pathPrefix: pathSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
  order: z.enum(['path', 'recent']).default('path'),
  include: publicIncludeQuerySchema,
});
export type PublicPageListQuery = z.infer<typeof publicPageListQuerySchema>;

/** Shared `?include=` query shape for endpoints returning a single PublicPageResource
 * (get by id, create, update properties, publish) — controls whether latestRevision/
 * publishedRevision are populated. */
export const publicPageIncludeQuerySchema = z.object({
  include: publicIncludeQuerySchema,
});
export type PublicPageIncludeQuery = z.infer<typeof publicPageIncludeQuerySchema>;

export const publicPageListResponseSchema = z.object({
  items: z.array(publicPageResourceSchema),
  nextCursor: z.string().nullable(),
});
export type PublicPageListResponse = z.infer<typeof publicPageListResponseSchema>;

export const publicPageCreateInputSchema = z.object({
  path: pathSchema,
  locale: z.string().min(1).max(20).optional(),
  title: z.string().min(1).max(200),
  contentSource: z.string().default(''),
});
export type PublicPageCreateInput = z.infer<typeof publicPageCreateInputSchema>;

export const newPageDialogInputSchema = publicPageCreateInputSchema.pick({ path: true, title: true });
export type NewPageDialogInput = z.infer<typeof newPageDialogInputSchema>;

export const publicDraftCreateInputSchema = z.object({
  title: z.string().min(1).max(200),
  contentSource: z.string().min(1),
  baseRevisionId: z.string().uuid().optional(),
  baseContentHash: z.string().optional(),
});
export type PublicDraftCreateInput = z.infer<typeof publicDraftCreateInputSchema>;

export const publicPagePropertiesInputSchema = z.object({
  path: pathSchema.optional(),
  title: z.string().min(1).max(200).optional(),
  baseRevisionId: z.string().uuid().optional(),
}).refine((value) => value.path || value.title, {
  message: 'Provide path or title',
});
export type PublicPagePropertiesInput = z.infer<typeof publicPagePropertiesInputSchema>;

export const publicRevisionListQuerySchema = z.object({
  status: z.enum(['published', 'draft', 'all']).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
});
export type PublicRevisionListQuery = z.infer<typeof publicRevisionListQuerySchema>;

export const publicRevisionListResponseSchema = z.object({
  items: z.array(publicRevisionResourceSchema),
  nextCursor: z.string().nullable(),
});
export type PublicRevisionListResponse = z.infer<typeof publicRevisionListResponseSchema>;

export const publicPublicationInputSchema = z.object({
  expectedRevisionId: z.string().uuid().optional(),
});
export type PublicPublicationInput = z.infer<typeof publicPublicationInputSchema>;

export const publicPageSearchQuerySchema = z
  .object({
    q: z.string().min(1).max(200),
    scope: z.enum(['path', 'title', 'content', 'all']).default('all'),
    status: z.enum(['published', 'draft', 'all']).default('published'),
    pathPrefix: pathSchema.optional(),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    cursor: z.string().optional(),
    include: publicIncludeQuerySchema,
    excerptLength: z.coerce.number().int().min(20).max(500).default(100),
    createdStart: z.coerce.date().optional(),
    createdEnd: z.coerce.date().optional(),
    updatedStart: z.coerce.date().optional(),
    updatedEnd: z.coerce.date().optional(),
  })
  .refine((value) => !value.createdStart || !value.createdEnd || value.createdStart <= value.createdEnd, {
    message: 'createdStart must be before or equal to createdEnd',
    path: ['createdStart'],
  })
  .refine((value) => !value.updatedStart || !value.updatedEnd || value.updatedStart <= value.updatedEnd, {
    message: 'updatedStart must be before or equal to updatedEnd',
    path: ['updatedStart'],
  });
export type PublicPageSearchQuery = z.infer<typeof publicPageSearchQuerySchema>;

export const publicSearchResultSchema = z.object({
  page: publicPageResourceSchema,
  matchType: z.enum(['path', 'title', 'content']),
  excerpt: z.string().nullable(),
  score: z.number().nullable(),
});
export type PublicSearchResult = z.infer<typeof publicSearchResultSchema>;

export const publicPageSearchResponseSchema = z.object({
  items: z.array(publicSearchResultSchema),
  nextCursor: z.string().nullable(),
});
export type PublicPageSearchResponse = z.infer<typeof publicPageSearchResponseSchema>;

export const publicPageTreeQuerySchema = z.object({
  status: z.enum(['published', 'draft', 'all']).default('published'),
  pathPrefix: pathSchema.optional(),
});
export type PublicPageTreeQuery = z.infer<typeof publicPageTreeQuerySchema>;

export const publicPageTreeNodeSchema: z.ZodType<PublicPageTreeNode> = z.object({
  path: z.string(),
  segment: z.string(),
  title: z.string().nullable(),
  pageId: z.string().uuid().nullable(),
  status: publicPageStatusSchema.nullable(),
  children: z.lazy(() => z.array(publicPageTreeNodeSchema)),
});
export type PublicPageTreeNode = {
  path: string;
  segment: string;
  title: string | null;
  pageId: string | null;
  status: PublicPageStatus | null;
  children: PublicPageTreeNode[];
};

export const publicPageTreeResponseSchema = z.object({
  root: publicPageTreeNodeSchema,
  pageCount: z.number().int().nonnegative(),
});
export type PublicPageTreeResponse = z.infer<typeof publicPageTreeResponseSchema>;

// ---- 008: Maintenance & Intelligence schemas ----

export const publicPageBatchCreateInputSchema = z.object({
  pages: z.array(publicPageCreateInputSchema).min(1).max(50),
});
export type PublicPageBatchCreateInput = z.infer<typeof publicPageBatchCreateInputSchema>;

export const publicBatchCreateResultSchema = z.object({
  created: z.array(
    z.object({
      id: z.string().uuid(),
      path: pathSchema,
      title: z.string(),
      revisionId: z.string().uuid(),
    }),
  ),
  count: z.number().int().nonnegative(),
});
export type PublicBatchCreateResult = z.infer<typeof publicBatchCreateResultSchema>;

export const publicBacklinkSchema = z.object({
  pageId: z.string().uuid(),
  path: pathSchema,
  title: z.string(),
  linkText: z.string(),
});
export type PublicBacklink = z.infer<typeof publicBacklinkSchema>;

export const publicBacklinksResponseSchema = z.object({
  items: z.array(publicBacklinkSchema),
});
export type PublicBacklinksResponse = z.infer<typeof publicBacklinksResponseSchema>;

export const publicRevisionDiffQuerySchema = z.object({
  against: z.coerce.number().int().min(1),
});
export type PublicRevisionDiffQuery = z.infer<typeof publicRevisionDiffQuerySchema>;

export const publicRevisionDiffResponseSchema = z.object({
  fromVersion: z.number().int().min(1),
  toVersion: z.number().int().min(1),
  diff: z.string(),
  additions: z.number().int().nonnegative(),
  deletions: z.number().int().nonnegative(),
});
export type PublicRevisionDiffResponse = z.infer<typeof publicRevisionDiffResponseSchema>;

export const publicStatsQuerySchema = z.object({
  include: z.enum(['orphans']).optional(),
});
export type PublicStatsQuery = z.infer<typeof publicStatsQuerySchema>;

export const publicStatsResponseSchema = z.object({
  totalPages: z.number().int().nonnegative(),
  publishedPages: z.number().int().nonnegative(),
  draftPages: z.number().int().nonnegative(),
  deletedPages: z.number().int().nonnegative(),
  recentActivity: z.object({
    createdInLast7Days: z.number().int().nonnegative(),
    updatedInLast7Days: z.number().int().nonnegative(),
  }),
  directories: z.array(z.object({ segment: z.string(), pageCount: z.number().int().nonnegative() })),
  orphans: z.array(z.object({ id: z.string().uuid(), path: z.string(), title: z.string() })).optional(),
});
export type PublicStatsResponse = z.infer<typeof publicStatsResponseSchema>;

export const publicSimilarQuerySchema = z
  .object({
    title: z.string().min(1).max(200).optional(),
    path: pathSchema.optional(),
    threshold: z.number().min(0).max(1).optional(),
  })
  .refine((v) => v.title || v.path, { message: 'At least one of title or path must be provided' });
export type PublicSimilarQuery = z.infer<typeof publicSimilarQuerySchema>;

export const publicSimilarResultSchema = z.object({
  pageId: z.string().uuid(),
  path: z.string(),
  title: z.string(),
  score: z.number().min(0).max(1),
});
export type PublicSimilarResult = z.infer<typeof publicSimilarResultSchema>;

export const publicSimilarResponseSchema = z.object({
  results: z.array(publicSimilarResultSchema),
  threshold: z.number().min(0).max(1),
});
export type PublicSimilarResponse = z.infer<typeof publicSimilarResponseSchema>;
