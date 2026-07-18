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

/** Accepts a single query value or repeated occurrences of the same key and
 * normalizes both to a string array; OR-combined by the caller. */
export const frontmatterFilterListSchema = z
  .union([z.string(), z.array(z.string())])
  .optional()
  .transform((value) => (value === undefined ? undefined : Array.isArray(value) ? value : [value]));

export const frontmatterHasFlagSchema = z
  .enum(['true', 'false'])
  .optional()
  .transform((value) => (value === undefined ? undefined : value === 'true'));

export const newDraftBodySchema = z.object({
  title: z.string().min(1).max(200),
  contentSource: z.string().min(1),
});
export type NewDraftBody = z.infer<typeof newDraftBodySchema>;

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
  // 022: optional until provenance projection lands for every revision route.
  origin: z.object({ actorKind: z.enum(['human', 'machine']) }).optional(),
  // 022: immutable link target recorded on link create/retarget revisions.
  linkTargetPageId: z.string().uuid().nullable().optional(),
  // 022: immutable raw-source metadata of a raw create/append chunk.
  source: z
    .object({
      channel: z.string().optional(),
      url: z.string().optional(),
      sessionId: z.string().optional(),
      command: z.string().optional(),
      occurredAt: z.string().datetime().optional(),
    })
    .nullable()
    .optional(),
  frontmatter: z.record(z.unknown()).nullable(),
  metadata: z.object({
    date: z.string().nullable(),
    summary: z.string().nullable(),
    tags: z.array(z.object({ id: z.string().uuid(), name: z.string(), normalizedName: z.string() })),
  }).optional(),
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
  // 022: optional until the raw/generated/link resource assembly lands.
  kind: z.enum(['native', 'link']).optional(),
  linkTarget: z
    .object({ pageId: z.string().uuid(), path: z.string(), title: z.string() })
    .nullable()
    .optional(),
  origin: z
    .object({
      actorKind: z.enum(['human', 'machine']),
      nature: z.enum(['original', 'generated']),
    })
    .optional(),
  humanModified: z.boolean().optional(),
  visibility: z.enum(['public', 'restricted']).optional(),
  contentSource: z.string().optional(),
  frontmatter: z.record(z.unknown()).nullable(),
  metadata: z.object({
    date: z.string().nullable(),
    summary: z.string().nullable(),
    tags: z.array(z.object({ id: z.string().uuid(), name: z.string(), normalizedName: z.string() })),
  }).optional(),
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

export const publicPageMetadataInputSchema = z.object({
  baseRevisionId: z.string().uuid(),
  title: z.string().min(1).max(200).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  tags: z.array(z.string().min(1).max(100)).max(50).nullable().optional(),
  summary: z.string().max(2000).nullable().optional(),
});
export type PublicPageMetadataInput = z.infer<typeof publicPageMetadataInputSchema>;

/** Replace a page's tag set. The server drafts + publishes the change so the
 * live page reflects it immediately (used by inline tag editing). */
export const publicPageTagsInputSchema = z.object({
  tags: z.array(z.string().min(1).max(100)).max(50),
});
export type PublicPageTagsInput = z.infer<typeof publicPageTagsInputSchema>;

export const publicTagSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  normalizedName: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type PublicTag = z.infer<typeof publicTagSchema>;

export const publicTagListQuerySchema = z.object({
  q: z.string().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
});
export const publicTagCreateInputSchema = z.object({ name: z.string().min(1).max(100) });
export const publicTagRenameInputSchema = z.object({ name: z.string().min(1).max(100) });
export const publicTagMergeInputSchema = z.object({ targetTagId: z.string().uuid() });
export const publicTagMutationSchema = z.object({
  id: z.string().uuid(),
  tagId: z.string().uuid(),
  targetTagId: z.string().uuid().nullable(),
  kind: z.enum(['rename', 'delete', 'merge']),
  status: z.enum(['queued', 'running', 'succeeded', 'failed']),
  requestedName: z.string().nullable(),
  affectedPageCount: z.number().int().nullable(),
  failure: z.string().nullable(),
  createdAt: z.string(),
  completedAt: z.string().nullable(),
});

export const publicPageListQuerySchema = z.object({
  status: z.enum(['published', 'draft', 'all', 'deleted']).default('published'),
  q: z.string().min(1).max(200).optional(),
  path: pathSchema.optional(),
  pathPrefix: pathSchema.optional(),
  // 022: space slug + frontmatter `type` filter for multi-space listings.
  space: z.string().optional(),
  filterType: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
  order: z.enum(['path', 'recent']).default('path'),
  include: publicIncludeQuerySchema,
  'filter[tag]': frontmatterFilterListSchema,
  'filter[status]': frontmatterFilterListSchema,
  'filter[owner]': frontmatterFilterListSchema,
  'filter[has_frontmatter]': frontmatterHasFlagSchema,
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

export type AdminPageSortKey = 'title' | 'path' | 'author' | 'updatedAt' | 'createdAt' | 'edits';
export type AdminPageSortDirection = 'asc' | 'desc';

export type AdminPageListItem = {
  id: string;
  path: string;
  title: string;
  status: 'draft' | 'published';
  authorDisplayName: string | null;
  authorEmail: string;
  editCount: number;
  createdAt: string;
  updatedAt: string;
  /** Tags on the page's latest revision. */
  tags: { id: string; name: string; normalizedName: string }[];
};

export type AdminPageListFilters = {
  /** Matches a page title, path, or its author's display name/email. */
  keyword?: string;
  /** @deprecated Use `keyword` for new admin page searches. */
  title?: string;
  /** @deprecated Use `keyword` for new admin page searches. */
  author?: string;
  /** @deprecated Use `keyword` for new admin page searches. */
  path?: string;
  dateFrom?: string;
  dateTo?: string;
};

export type AdminPageListResult = {
  items: AdminPageListItem[];
  totalItems: number;
  currentPage: number;
  totalPages: number;
  pageSize: number;
  sort: AdminPageSortKey;
  direction: AdminPageSortDirection;
  filters: AdminPageListFilters;
};

export type AdminPageStats = {
  totalPages: number;
  totalEdits: number;
  totalPageLinks: number;
};

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
  metadata: z.object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
    tags: z.array(z.string().min(1).max(100)).max(50),
    summary: z.string().max(2000).nullable(),
  }).optional(),
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
    'filter[tag]': frontmatterFilterListSchema,
    'filter[status]': frontmatterFilterListSchema,
    'filter[owner]': frontmatterFilterListSchema,
    'filter[has_frontmatter]': frontmatterHasFlagSchema,
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

// ---- 013: Header hybrid page search ---------------------------------------

export const hybridSearchSemanticStateSchema = z.enum(['pending', 'ready', 'unavailable', 'failed', 'skipped']);
export type HybridSearchSemanticState = z.infer<typeof hybridSearchSemanticStateSchema>;

export const hybridSearchQueryInputSchema = z.object({
  kind: z.literal('query'),
  searchRecordId: z.string().uuid(),
  searchSessionId: z.string().uuid(),
  q: z.string().trim().min(2).max(200),
  limit: z.number().int().min(1).max(20).default(20),
});
export type HybridSearchQueryInput = z.infer<typeof hybridSearchQueryInputSchema>;

export const hybridSearchBehaviorInputSchema = z.object({
  kind: z.literal('behavior'),
  eventId: z.string().uuid(),
  searchRecordId: z.string().uuid(),
  searchSessionId: z.string().uuid(),
  action: z.enum(['result_open', 'escape']),
  pageId: z.string().uuid().optional(),
});
export type HybridSearchBehaviorInput = z.infer<typeof hybridSearchBehaviorInputSchema>;

export const hybridPageSearchInputSchema = z.discriminatedUnion('kind', [hybridSearchQueryInputSchema, hybridSearchBehaviorInputSchema]);
export type HybridPageSearchInput = z.infer<typeof hybridPageSearchInputSchema>;

// ---- 017: Stable search capability vocabulary ------------------------------

export const searchCapabilityIdSchema = z.enum(['full_text', 'fuzzy', 'semantic']);
export type SearchCapabilityId = z.infer<typeof searchCapabilityIdSchema>;

export const searchEngineRunStateSchema = z.enum(['ready', 'pending', 'skipped', 'unavailable', 'failed', 'timed_out']);
export type SearchEngineRunState = z.infer<typeof searchEngineRunStateSchema>;

export const hybridSearchEngineStateSchema = z.object({
  capability: searchCapabilityIdSchema,
  state: searchEngineRunStateSchema,
  resultCount: z.number().int().min(0),
});
export type HybridSearchEngineState = z.infer<typeof hybridSearchEngineStateSchema>;

export const hybridSearchResultSchema = z.object({
  page: publicPageResourceSchema,
  excerpt: z.string().nullable(),
  score: z.number(),
  relevanceScore: z.number().min(-1).max(1),
  matchSources: z.array(z.enum(['keyword', 'semantic'])).min(1),
  // Absent only in old stored/compatibility responses; new coordinator
  // responses always include stable capability provenance.
  engineSources: z.array(searchCapabilityIdSchema).min(1).optional(),
});
export type HybridSearchResult = z.infer<typeof hybridSearchResultSchema>;

export const hybridPageSearchResponseSchema = z.object({
  searchRecordId: z.string().uuid(),
  semanticState: hybridSearchSemanticStateSchema,
  engineStates: z.array(hybridSearchEngineStateSchema).optional(),
  items: z.array(hybridSearchResultSchema),
});
export type HybridPageSearchResponse = z.infer<typeof hybridPageSearchResponseSchema>;

export const publicPageTreeQuerySchema = z.object({
  status: z.enum(['published', 'draft', 'all']).default('published'),
  pathPrefix: pathSchema.optional(),
  // 022: space slug + frontmatter `type` filter for multi-space trees.
  space: z.string().optional(),
  filterType: z.string().optional(),
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

// ---- 010: AI Curation API — link graph ----

export const publicLinkSourceSchema = z.enum(['markdown', 'wiki', 'frontmatter']);
export type PublicLinkSource = z.infer<typeof publicLinkSourceSchema>;

export const publicOutboundLinkSchema = z.object({
  source: publicLinkSourceSchema,
  targetPath: z.string(),
  targetPageId: z.string().uuid(),
  targetStatus: publicPageStatusSchema,
  linkText: z.string(),
});
export type PublicOutboundLink = z.infer<typeof publicOutboundLinkSchema>;

export const publicDanglingLinkSchema = z.object({
  source: publicLinkSourceSchema,
  targetPath: z.string(),
  targetStatus: publicPageStatusSchema.optional(),
  linkText: z.string(),
});
export type PublicDanglingLink = z.infer<typeof publicDanglingLinkSchema>;

export const publicExternalLinkSchema = z.object({
  source: z.literal('markdown'),
  href: z.string(),
  linkText: z.string(),
});
export type PublicExternalLink = z.infer<typeof publicExternalLinkSchema>;

export const publicOutboundLinksResponseSchema = z.object({
  pageId: z.string().uuid(),
  links: z.array(publicOutboundLinkSchema),
  dangling: z.array(publicDanglingLinkSchema),
  external: z.array(publicExternalLinkSchema),
});
export type PublicOutboundLinksResponse = z.infer<typeof publicOutboundLinksResponseSchema>;

export const publicNeighborhoodQuerySchema = z.object({
  node: z.string().uuid(),
  depth: z.coerce.number().int().min(1).max(3).default(1),
  direction: z.enum(['out', 'in', 'both']).default('out'),
});
export type PublicNeighborhoodQuery = z.infer<typeof publicNeighborhoodQuerySchema>;

export const publicNeighborViaSchema = z.enum(['markdown', 'wiki', 'frontmatter', 'backlink']);
export type PublicNeighborVia = z.infer<typeof publicNeighborViaSchema>;

export const publicNeighborNodeSchema = z.object({
  pageId: z.string().uuid(),
  path: z.string(),
  title: z.string(),
  viaLinkSource: publicNeighborViaSchema.optional(),
});
export type PublicNeighborNode = z.infer<typeof publicNeighborNodeSchema>;

export const publicNeighborhoodResponseSchema = z.object({
  root: z.object({
    pageId: z.string().uuid(),
    path: z.string(),
    title: z.string(),
  }),
  tiers: z.array(z.array(publicNeighborNodeSchema)),
});
export type PublicNeighborhoodResponse = z.infer<typeof publicNeighborhoodResponseSchema>;

// ---- 010: AI Curation API — bulk write operations ----

export const publicBatchPreviewSchema = z.record(z.unknown());
export type PublicBatchPreview = z.infer<typeof publicBatchPreviewSchema>;

export const publicBatchItemResultSchema = z.object({
  pageId: z.string().uuid(),
  status: z.enum(['success', 'failed']),
  revisionId: z.string().uuid().optional(),
  preview: publicBatchPreviewSchema.optional(),
  error: z
    .object({
      code: z.string(),
      message: z.string(),
    })
    .optional(),
});
export type PublicBatchItemResult = z.infer<typeof publicBatchItemResultSchema>;

export const publicPageBatchUpdateItemInputSchema = z.object({
  pageId: z.string().uuid(),
  title: z.string().min(1).max(200).optional(),
  path: pathSchema.optional(),
  /** Partial patch: keys present are written; `null` deletes the key; absent keys are preserved. */
  frontmatter: z.record(z.unknown().nullable()).optional(),
  baseRevisionId: z.string().uuid(),
});
export type PublicPageBatchUpdateItemInput = z.infer<typeof publicPageBatchUpdateItemInputSchema>;

export const publicPageBatchUpdateInputSchema = z.object({
  items: z.array(publicPageBatchUpdateItemInputSchema).min(1).max(50),
});
export type PublicPageBatchUpdateInput = z.infer<typeof publicPageBatchUpdateInputSchema>;

export const publicPageBatchUpdateResultSchema = z.object({
  results: z.array(publicBatchItemResultSchema),
  successCount: z.number().int().nonnegative(),
  failureCount: z.number().int().nonnegative(),
  dryRun: z.boolean().optional(),
});
export type PublicPageBatchUpdateResult = z.infer<typeof publicPageBatchUpdateResultSchema>;

export const publicPageBatchDeleteInputSchema = z.object({
  pageIds: z.array(z.string().uuid()).min(1).max(50),
});
export type PublicPageBatchDeleteInput = z.infer<typeof publicPageBatchDeleteInputSchema>;

export const publicPageBatchDeleteResultSchema = z.object({
  results: z.array(publicBatchItemResultSchema),
  successCount: z.number().int().nonnegative(),
  failureCount: z.number().int().nonnegative(),
  dryRun: z.boolean().optional(),
});
export type PublicPageBatchDeleteResult = z.infer<typeof publicPageBatchDeleteResultSchema>;

export const publicDryRunQuerySchema = z.object({
  dry_run: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => value === 'true'),
});
export type PublicDryRunQuery = z.infer<typeof publicDryRunQuerySchema>;
