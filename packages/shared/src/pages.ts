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
  status: z.enum(['published', 'draft', 'all']).default('published'),
  q: z.string().min(1).max(200).optional(),
  path: pathSchema.optional(),
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
  contentSource: z.string().min(1),
});
export type PublicPageCreateInput = z.infer<typeof publicPageCreateInputSchema>;

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
