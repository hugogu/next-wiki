import { z } from 'zod';
import {
  apiKeyCreatedSchema,
  apiKeyRevealSchema,
  apiKeyScopeSchema,
  apiKeyViewSchema,
  auditEntrySchema,
  auditListResponseSchema,
  auditQueryParamsSchema,
  changeEmailInputSchema,
  changePasswordInputSchema,
  createApiKeyInputSchema,
  createPageInputSchema,
  editableViewSchema,
  livePageSchema,
  loginInputSchema,
  loginOutputSchema,
  meOutputSchema,
  newDraftBodySchema,
  pageSummarySchema,
  preferencesViewSchema,
  registerInputSchema,
  resetPasswordInputSchema,
  revisionInputSchema,
  revisionSummarySchema,
  revisionViewSchema,
  setMyPasswordInputSchema,
  setRoleInputSchema,
  setStatusInputSchema,
  setupInputSchema,
  updatePagePropertiesSchema,
  updatePreferencesInputSchema,
  updateProfileInputSchema,
  userViewSchema,
  assetUploadResultSchema,
  storageOverviewSchema,
  storageBackendViewSchema,
  storageBackendUpsertSchema,
  backendCheckSchema,
  backendCheckResultSchema,
  migrationViewSchema,
  migrationListSchema,
  migrationStartSchema,
  cleanupJobViewSchema,
  cleanupStartSchema,
  storageBackendDisableSchema,
  storageBackendEnableSchema,
  storageReadBackendSchema,
  replicaSyncStatusSchema,
  gitExportUpsertSchema,
  gitSshKeyResultSchema,
  gitExportRunResultSchema,
} from '@next-wiki/shared';

export {
  apiKeyCreatedSchema,
  apiKeyRevealSchema,
  apiKeyScopeSchema,
  apiKeyViewSchema,
  auditEntrySchema,
  auditListResponseSchema,
  auditQueryParamsSchema,
  changeEmailInputSchema,
  changePasswordInputSchema,
  createApiKeyInputSchema,
  createPageInputSchema,
  editableViewSchema,
  livePageSchema,
  loginInputSchema,
  loginOutputSchema,
  meOutputSchema,
  newDraftBodySchema,
  pageSummarySchema,
  preferencesViewSchema,
  registerInputSchema,
  resetPasswordInputSchema,
  revisionInputSchema,
  revisionSummarySchema,
  revisionViewSchema,
  setMyPasswordInputSchema,
  setRoleInputSchema,
  setStatusInputSchema,
  setupInputSchema,
  updatePagePropertiesSchema,
  updatePreferencesInputSchema,
  updateProfileInputSchema,
  userViewSchema,
};

export const pageSummaryListSchema = z
  .array(pageSummarySchema)
  .describe('List of published page summaries');

export const revisionSummaryListSchema = z
  .array(revisionSummarySchema)
  .describe('List of revision summaries');

export const userViewListSchema = z.array(userViewSchema).describe('List of users');

export const okResponseSchema = z.object({ ok: z.boolean() }).describe('Simple OK response');

export const previewInputSchema = z
  .object({ contentSource: z.string() })
  .describe('Markdown preview input');

export const previewOutputSchema = z
  .object({ html: z.string() })
  .describe('Rendered HTML output');

export const registerOutputSchema = z
  .object({ userId: z.string() })
  .describe('Registration response');

export const changeEmailOutputSchema = z
  .object({ id: z.string(), email: z.string() })
  .describe('Changed email response');

export const profileViewSchema = z
  .object({ id: z.string(), email: z.string(), displayName: z.string().nullable() })
  .describe('Profile view');

export const userIdParamSchema = z.object({ id: z.string().uuid() }).describe('User ID path parameter');

export const pagePathParamSchema = z.object({ path: z.string() }).describe('Page path parameter');

export const revisionPathParamSchema = z
  .object({ path: z.string(), n: z.string() })
  .describe('Revision path and version parameters');

export const apiKeyViewListSchema = z.array(apiKeyViewSchema).describe('List of API keys');

export const errorResponseSchema = z
  .object({
    error: z.string(),
    code: z.string(),
  })
  .describe('API error response');

export const PublicPagePath = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[a-z0-9]([a-z0-9-/]*[a-z0-9])?$/)
  .describe('Canonical wiki page path. Use lowercase slash-separated path segments.');

export const PublicPageIdPathParams = z
  .object({
    id: z.string().uuid().describe('Stable public page identifier.'),
  })
  .describe('Public page ID path parameters.');

export const PublicPageRevisionPathParams = z
  .object({
    id: z.string().uuid().describe('Stable public page identifier.'),
    version: z.coerce.number().int().min(1).describe('Revision version number.'),
  })
  .describe('Public page revision path parameters.');

export const PublicAssetIdPathParams = z
  .object({
    id: z.string().uuid().describe('Stable public asset identifier.'),
  })
  .describe('Public asset ID path parameters.');

export const PublicImageContentType = z.enum([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/svg+xml',
]);

export const PublicAuthor = z
  .object({
    id: z.string().uuid().nullable().describe('Author user identifier, or null when the author is not disclosed.'),
    displayName: z.string().nullable().describe('Author display name, or null when not available.'),
  })
  .describe('Public author identity visible to the caller.');

export const PublicRevisionSummary = z
  .object({
    id: z.string().uuid().describe('Stable revision identifier.'),
    pageId: z.string().uuid().describe('Identifier of the page this revision belongs to.'),
    version: z.number().int().min(1).describe('Monotonically increasing revision version, starting at 1.'),
    status: z.enum(['draft', 'published']).describe('Revision lifecycle state: an unpublished draft or a published revision.'),
    contentType: z.literal('text/markdown').describe('Content media type of the revision body. Always text/markdown.'),
    contentHash: z.string().describe('Content hash of the Markdown source, used for optimistic concurrency control.'),
    author: PublicAuthor,
    createdAt: z.string().datetime().describe('Timestamp when the revision was created (ISO 8601).'),
    publishedAt: z
      .string()
      .datetime()
      .nullable()
      .describe('Timestamp when the revision was published (ISO 8601), or null if still a draft.'),
    canPublish: z.boolean().describe('Whether the current caller is allowed to publish this revision.'),
  })
  .describe('Public page revision metadata.');

export const PublicRevisionResource = PublicRevisionSummary.extend({
  contentSource: z
    .string()
    .optional()
    .describe('Markdown source of the revision. Present only on GET /pages/{id}/revisions/{version}; omitted from the revision list.'),
}).describe('Public page revision with Markdown source when the caller may read it.');

export const PublicPageIncludeValue = z
  .enum(['latestRevision', 'publishedRevision'])
  .describe('Optional page relation that can be requested via ?include=.');

export const PublicPageResource = z
  .object({
    id: z.string().uuid().describe('Stable public page identifier.'),
    spaceSlug: z.string().describe('Slug of the wiki space the page belongs to.'),
    path: PublicPagePath,
    locale: z.string().describe('Locale of the page content (e.g. "en", "zh").'),
    title: z.string().describe('Human-readable page title.'),
    contentSource: z
      .string()
      .optional()
      .describe('Markdown source of the current revision. Omitted from list/search results; present on single-page reads and writes.'),
    status: z
      .enum(['draft', 'published', 'deleted'])
      .describe('Page lifecycle state: an unpublished draft, a published page, or a soft-deleted page.'),
    author: PublicAuthor,
    latestRevision: PublicRevisionSummary
      .nullable()
      .optional()
      .describe('Most recent revision of any status, or null if none exists. Omitted unless requested via ?include=latestRevision.'),
    publishedRevision: PublicRevisionSummary
      .nullable()
      .optional()
      .describe('Most recent published revision, or null if never published. Omitted unless requested via ?include=publishedRevision.'),
    createdAt: z.string().datetime().describe('Timestamp when the page was created (ISO 8601).'),
    updatedAt: z.string().datetime().describe('Timestamp when the page was last updated (ISO 8601).'),
    links: z
      .object({
        self: z.string().describe('Canonical API URL of this page resource. Also the target for PATCH updates.'),
        byPath: z.string().describe('API URL to look up this page by its canonical path (GET /v1/pages?path=...).'),
        revisions: z.string().describe('API URL listing this page revisions.'),
        drafts: z.string().describe('API URL for creating draft revisions of this page.'),
      })
      .describe('Related API resource URLs for this page.'),
  })
  .describe('Public wiki page resource.');

export const PublicPageListQuery = z
  .object({
    status: z
      .enum(['published', 'draft', 'all'])
      .optional()
      .default('published')
      .describe('Filter pages by lifecycle state. Defaults to published.'),
    q: z.string().min(1).max(200).optional().describe('Optional free-text query to filter pages by path or title.'),
    path: PublicPagePath.optional().describe(
      'Exact canonical path to look up a single page. When provided, returns at most one matching page and ignores other filters.',
    ),
    pathPrefix: PublicPagePath.optional().describe(
      'Directory prefix to list all pages under a subtree (e.g. "docs" matches "docs/a", "docs/b", "docs"). Cannot be combined with path.',
    ),
    limit: z.coerce
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .default(20)
      .describe('Maximum number of pages to return per request (1-100). Defaults to 20.'),
    cursor: z.string().optional().describe('Opaque pagination cursor returned by a previous response.'),
    order: z
      .enum(['path', 'recent'])
      .optional()
      .default('path')
      .describe('Sort order: alphabetical by path, or most recently updated first. Defaults to path.'),
    include: z
      .string()
      .optional()
      .describe(
        'Comma-separated relations to include: latestRevision, publishedRevision. Omitted by default; fetch a specific revision via GET /pages/{id}/revisions/{version} instead.',
      ),
  })
  .describe('Public page list query parameters.');

export const PublicPageIncludeQuery = z
  .object({
    include: z
      .string()
      .optional()
      .describe('Comma-separated relations to include in the returned page resource: latestRevision, publishedRevision.'),
  })
  .describe('Optional ?include= query parameter for endpoints returning a single PublicPageResource.');

export const PublicPageListResponse = z
  .object({
    items: z.array(PublicPageResource).describe('Page resources for the current result window.'),
    nextCursor: z.string().nullable().describe('Cursor for the next page of results, or null when there are no more.'),
  })
  .describe('Paginated public page list.');

export const PublicPageCreateInput = z
  .object({
    path: PublicPagePath,
    locale: z.string().min(1).max(20).optional().describe('Locale of the page content (e.g. "en"). Defaults to the workspace default.'),
    title: z.string().min(1).max(200).describe('Human-readable page title.'),
    contentSource: z.string().optional().default('').describe('Markdown source of the initial page revision. Optional; defaults to an empty draft.'),
  })
  .describe('Create a public wiki page.');

export const PublicDraftCreateInput = z
  .object({
    title: z.string().min(1).max(200).describe('Human-readable title for the draft revision.'),
    contentSource: z.string().min(1).describe('Markdown source of the draft revision.'),
    baseRevisionId: z
      .string()
      .uuid()
      .optional()
      .describe('Revision the draft is based on, for conflict detection. Omit to base on the latest revision.'),
    baseContentHash: z
      .string()
      .optional()
      .describe('Expected content hash of the base revision, used for optimistic concurrency control.'),
  })
  .describe('Create a draft revision for an existing public page.');

export const PublicPagePropertiesInput = z
  .object({
    path: PublicPagePath.optional(),
    title: z.string().min(1).max(200).optional().describe('New page title.'),
    baseRevisionId: z
      .string()
      .uuid()
      .optional()
      .describe('Expected current revision id, used for optimistic concurrency control.'),
  })
  .describe('Update page properties. Provide at least one of path or title.');

export const PublicRevisionListQuery = z
  .object({
    status: z
      .enum(['published', 'draft', 'all'])
      .optional()
      .describe('Filter revisions by lifecycle state. Defaults to all.'),
    limit: z.coerce
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .default(20)
      .describe('Maximum number of revisions to return per request (1-100). Defaults to 20.'),
    cursor: z.string().optional().describe('Opaque pagination cursor returned by a previous response.'),
  })
  .describe('Public revision list query parameters.');

export const PublicRevisionListResponse = z
  .object({
    items: z.array(PublicRevisionResource).describe('Revision resources for the current result window.'),
    nextCursor: z.string().nullable().describe('Cursor for the next page of results, or null when there are no more.'),
  })
  .describe('Paginated public revision list.');

export const PublicPublicationInput = z
  .object({
    expectedRevisionId: z
      .string()
      .uuid()
      .optional()
      .describe('Revision id the caller expects to publish, used for optimistic concurrency control.'),
  })
  .describe('Publish revision input.');

export const PublicPageSearchQuery = z
  .object({
    q: z.string().min(1).max(200).describe('Free-text search query.'),
    scope: z
      .enum(['path', 'title', 'content', 'all'])
      .optional()
      .default('all')
      .describe('Restrict matching to a field, or search across all fields. Defaults to all.'),
    status: z
      .enum(['published', 'draft', 'all'])
      .optional()
      .default('published')
      .describe('Filter results by page lifecycle state. Defaults to published.'),
    pathPrefix: PublicPagePath.optional().describe(
      'Directory prefix to restrict matching to pages under a subtree (e.g. "docs" matches "docs/a", "docs/b").',
    ),
    limit: z.coerce
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .default(20)
      .describe('Maximum number of results to return per request (1-100). Defaults to 20.'),
    cursor: z.string().optional().describe('Opaque pagination cursor returned by a previous response.'),
    include: z
      .string()
      .optional()
      .describe('Comma-separated relations to include on each result page: latestRevision, publishedRevision.'),
    excerptLength: z.coerce
      .number()
      .int()
      .min(20)
      .max(500)
      .optional()
      .default(100)
      .describe('Approximate number of characters of context to return around the matched keyword in excerpt (20-500). Defaults to 100.'),
    createdStart: z.coerce.date().optional().describe('Only include pages created at or after this ISO 8601 timestamp.'),
    createdEnd: z.coerce.date().optional().describe('Only include pages created at or before this ISO 8601 timestamp.'),
    updatedStart: z.coerce.date().optional().describe('Only include pages last updated at or after this ISO 8601 timestamp.'),
    updatedEnd: z.coerce.date().optional().describe('Only include pages last updated at or before this ISO 8601 timestamp.'),
  })
  .describe('Public page search query parameters.');

export const PublicSearchResult = z
  .object({
    page: PublicPageResource,
    matchType: z.enum(['path', 'title', 'content']).describe('Which field produced the match for this result.'),
    excerpt: z
      .string()
      .nullable()
      .describe(
        'Snippet of contentSource centered on the matched keyword (~excerptLength characters), or null for path/title matches or when not applicable. The result page never includes the full contentSource.',
      ),
    score: z
      .number()
      .nullable()
      .describe(
        'Relevance score in (0, 1]. Path matches score highest, then title, then content (weighted by how many times the term appears). Results are sorted by score descending within each returned page; null is not currently produced.',
      ),
  })
  .describe('Public page search result.');

export const PublicPageSearchResponse = z
  .object({
    items: z.array(PublicSearchResult).describe('Search results for the current result window.'),
    nextCursor: z.string().nullable().describe('Cursor for the next page of results, or null when there are no more.'),
  })
  .describe('Paginated public page search response.');

export const PublicPageTreeNode: z.ZodType<{
  path: string;
  segment: string;
  title: string | null;
  pageId: string | null;
  status: 'draft' | 'published' | 'deleted' | null;
  children: unknown[];
}> = z
  .object({
    path: z.string().describe('Full canonical path of this node (may be empty for the root).'),
    segment: z.string().describe('Last slash-separated segment of the path.'),
    title: z.string().nullable().describe('Page title when a page exists at this path, otherwise null.'),
    pageId: z.string().uuid().nullable().describe('Page id when a page exists at this path, otherwise null.'),
    status: z.enum(['draft', 'published', 'deleted']).nullable().describe('Page status when a page exists, otherwise null.'),
    children: z.array(z.lazy(() => PublicPageTreeNode)).describe('Child nodes ordered by path segment.'),
  })
  .describe('A single node in the public wiki page directory tree.');

export const PublicPageTreeQuery = z
  .object({
    status: z
      .enum(['published', 'draft', 'all'])
      .optional()
      .default('published')
      .describe('Filter pages by lifecycle state. Defaults to published.'),
    pathPrefix: PublicPagePath.optional().describe(
      'Directory prefix to scope the tree to a subtree (e.g. "docs" returns only the docs/ branch).',
    ),
  })
  .describe('Public page tree query parameters.');

export const PublicPageTreeResponse = z
  .object({
    root: PublicPageTreeNode.describe('Root node of the directory tree. When pathPrefix is set, this is the prefix node.'),
    pageCount: z.number().int().nonnegative().describe('Total number of visible pages represented in the tree.'),
  })
  .describe('Hierarchical directory structure of public wiki pages.');

export const PublicPageBatchCreateInput = z
  .object({
    pages: z.array(PublicPageCreateInput).min(1).max(50).describe('Pages to create atomically (1-50).'),
  })
  .describe('Batch create public wiki pages.');

export const PublicBatchCreateResult = z
  .object({
    created: z.array(
      z.object({
        id: z.string().uuid().describe('Created page identifier.'),
        path: PublicPagePath.describe('Canonical path of the created page.'),
        title: z.string().describe('Title of the created page.'),
        revisionId: z.string().uuid().describe('Identifier of the initial draft revision.'),
      }),
    ),
    count: z.number().int().nonnegative().describe('Number of pages created.'),
  })
  .describe('Result of a batch page creation request.');

export const PublicBacklink = z
  .object({
    pageId: z.string().uuid().describe('Identifier of the page containing the link.'),
    path: PublicPagePath.describe('Canonical path of the page containing the link.'),
    title: z.string().describe('Title of the page containing the link.'),
    linkText: z.string().describe('Link text used in the Markdown link.'),
  })
  .describe('A single backlink to a target page.');

export const PublicBacklinksResponse = z
  .object({
    items: z.array(PublicBacklink).describe('Pages visible to the caller that link to the target page.'),
  })
  .describe('Backlinks response.');

export const PublicRevisionDiffQuery = z
  .object({
    against: z.coerce.number().int().min(1).describe('Earlier version number to diff against.'),
  })
  .describe('Revision diff query parameters.');

export const PublicRevisionDiffResponse = z
  .object({
    fromVersion: z.number().int().min(1).describe('Earlier revision version.'),
    toVersion: z.number().int().min(1).describe('Later revision version.'),
    diff: z.string().describe('Unified diff between the two revision sources.'),
    additions: z.number().int().nonnegative().describe('Number of added lines.'),
    deletions: z.number().int().nonnegative().describe('Number of removed lines.'),
  })
  .describe('Structured diff between two page revisions.');

export const PublicStatsQuery = z
  .object({
    include: z.enum(['orphans']).optional().describe('Optional additional report; "orphans" lists pages with zero inbound links.'),
  })
  .describe('Wiki stats query parameters.');

export const PublicStatsResponse = z
  .object({
    totalPages: z.number().int().nonnegative().describe('Total visible pages.'),
    publishedPages: z.number().int().nonnegative().describe('Published pages visible to the caller.'),
    draftPages: z.number().int().nonnegative().describe('Draft pages visible to the caller.'),
    deletedPages: z.number().int().nonnegative().describe('Soft-deleted pages visible to the caller.'),
    recentActivity: z.object({
      createdInLast7Days: z.number().int().nonnegative().describe('Pages created in the last 7 days.'),
      updatedInLast7Days: z.number().int().nonnegative().describe('Pages updated in the last 7 days.'),
    }),
    directories: z.array(z.object({ segment: z.string(), pageCount: z.number().int().nonnegative() })).describe('Top-level directory breakdown.'),
    orphans: z
      .array(z.object({ id: z.string().uuid(), path: z.string(), title: z.string() }))
      .optional()
      .describe('Pages with no inbound links, when include=orphans is requested.'),
  })
  .describe('Aggregate wiki statistics.');

export const PublicSimilarQuery = z
  .object({
    title: z.string().min(1).max(200).optional().describe('Proposed page title.'),
    path: PublicPagePath.optional().describe('Proposed page path.'),
    threshold: z.number().min(0).max(1).optional().describe('Minimum similarity score [0,1]; defaults to 0.5.'),
  })
  .refine((value) => value.title || value.path, { message: 'At least one of title or path must be provided' })
  .describe('Similar-page detection request.');

export const PublicSimilarResult = z
  .object({
    pageId: z.string().uuid().describe('Existing page identifier.'),
    path: z.string().describe('Existing page path.'),
    title: z.string().describe('Existing page title.'),
    score: z.number().min(0).max(1).describe('Similarity score in [0, 1].'),
  })
  .describe('A single similar-page candidate.');

export const PublicSimilarResponse = z
  .object({
    results: z.array(PublicSimilarResult).describe('Candidate similar pages sorted by score descending.'),
    threshold: z.number().min(0).max(1).describe('Threshold applied to the result set.'),
  })
  .describe('Similar-page detection response.');

export const PublicAssetResource = z
  .object({
    id: z.string().uuid().describe('Stable public asset identifier.'),
    contentType: PublicImageContentType.describe('MIME type of the stored asset.'),
    sizeBytes: z.number().int().nonnegative().describe('Size of the asset in bytes.'),
    url: z.string().describe('URL to fetch the asset content.'),
    markdown: z.string().describe('Ready-to-paste Markdown image snippet referencing this asset.'),
    createdAt: z.string().datetime().describe('Timestamp when the asset was created (ISO 8601).'),
  })
  .describe('Public wiki asset metadata.');

export const PublicAssetUploadResult = z
  .object({
    id: z.string().uuid().describe('Stable public asset identifier.'),
    contentType: PublicImageContentType.describe('MIME type of the uploaded asset.'),
    sizeBytes: z.number().int().nonnegative().describe('Size of the uploaded asset in bytes.'),
    url: z.string().describe('URL to fetch the uploaded asset content.'),
    markdown: z.string().describe('Ready-to-paste Markdown image snippet referencing the uploaded asset.'),
    createdAt: z.string().datetime().describe('Timestamp when the asset was created (ISO 8601).'),
  })
  .describe('Uploaded public wiki asset metadata.');

export const AssetUploadResult = assetUploadResultSchema;
export const StorageOverview = storageOverviewSchema;
export const StorageBackendView = storageBackendViewSchema;
export const StorageBackendUpsert = storageBackendUpsertSchema;
export const BackendCheckInput = backendCheckSchema;
export const BackendCheckResult = backendCheckResultSchema;
export const MigrationView = migrationViewSchema;
export const MigrationList = migrationListSchema;
export const MigrationStartInput = migrationStartSchema;
export const CleanupJobView = cleanupJobViewSchema;
export const CleanupStartInput = cleanupStartSchema;
export const StorageBackendDisable = storageBackendDisableSchema;
export const StorageBackendEnable = storageBackendEnableSchema;
export const StorageReadBackend = storageReadBackendSchema;
export const ReplicaSyncStatus = replicaSyncStatusSchema;
export const GitExportUpsert = gitExportUpsertSchema;
export const GitSshKeyResult = gitSshKeyResultSchema;
export const GitExportRunResult = gitExportRunResultSchema;

export const ApiKeyViewList = apiKeyViewListSchema;
export const CreateApiKeyInput = createApiKeyInputSchema;
export const ApiKeyCreated = apiKeyCreatedSchema;
export const ApiKeyReveal = apiKeyRevealSchema;
export const AuditListResponse = auditListResponseSchema;

export const PageSummaryList = pageSummaryListSchema;
export const RevisionSummaryList = revisionSummaryListSchema;
export const UserViewList = userViewListSchema;
export const OkResponse = okResponseSchema;
export const PreviewInput = previewInputSchema;
export const PreviewOutput = previewOutputSchema;
export const RegisterOutput = registerOutputSchema;
export const ChangeEmailOutputSchema = changeEmailOutputSchema;
export const ProfileViewSchema = profileViewSchema;
export const UserIdParamSchema = userIdParamSchema;
export const PagePathParamSchema = pagePathParamSchema;
export const RevisionPathParamSchema = revisionPathParamSchema;
export const ErrorResponse = errorResponseSchema;
