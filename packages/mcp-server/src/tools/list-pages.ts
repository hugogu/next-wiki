import { z } from 'zod';
import {
  contentSpaceSchema,
  publicRawInputKindSchema,
  type ContentSpace,
  type PublicPageResource,
  type WikiApiClient,
} from '../api-client';
import { listPagesResponse } from '../shapes';

// 046: extend the space enum with 'all' so callers can search across all spaces
// by passing 'all' or omitting the parameter. Existing callers that pass a
// concrete space (default/raw/generated) see no behavior change.
const listPagesSpaceSchema = z
  .union([contentSpaceSchema, z.literal('all')])
  .optional()
  .describe(
    'Content space to search: default wiki, raw evidence, or generated concepts. ' +
      'Pass "all" or omit to search across all three spaces.',
  );

const ALL_CONTENT_SPACES: readonly ContentSpace[] = ['default', 'raw', 'generated'] as const;

export const listPagesSchema = {
  status: z
    .enum(['published', 'draft', 'all'])
    .optional()
    .describe('Filter by status; defaults to published'),
  path: z.string().optional().describe('Exact path lookup (returns at most one)'),
  pathPrefix: z
    .string()
    .optional()
    .describe('List all pages under a directory subtree (e.g. "docs")'),
  space: listPagesSpaceSchema,
  filterType: z
    .string()
    .min(1)
    .max(200)
    .optional()
    .describe('Exact OKF frontmatter type filter (generated space only)'),
  filterInputKind: publicRawInputKindSchema.optional().describe(
    'Raw-only: exact capture-channel filter, independent from filterType',
  ),
  filterCategoryId: z
    .string()
    .uuid()
    .optional()
    .describe('Raw-only: taxonomy category id filter, independent from filterType'),
  filterTag: z
    .string()
    .min(1)
    .max(100)
    .optional()
    .describe('Structured page tag filter (normalized exact match)'),
  createdStart: z
    .string()
    .datetime()
    .optional()
    .describe('Only include pages created at or after this ISO 8601 timestamp'),
  createdEnd: z
    .string()
    .datetime()
    .optional()
    .describe('Only include pages created at or before this ISO 8601 timestamp'),
  order: z
    .enum(['path', 'recent', 'createdAtAsc', 'createdAtDesc', 'updatedAtAsc', 'updatedAtDesc'])
    .optional()
    .describe('Result order; use createdAtDesc for newest pages first'),
  limit: z
    .number()
    .int()
    .min(1)
    .max(100)
    .optional()
    .describe('Maximum results; defaults to 20'),
  cursor: z.string().optional().describe('Pagination cursor from previous call'),
};
export type ListPagesInput = z.infer<z.ZodObject<typeof listPagesSchema>>;

export async function listPages(client: WikiApiClient, args: ListPagesInput) {
  const wantsAllSpaces = args.space === undefined || args.space === 'all';

  if (!wantsAllSpaces) {
    const response = await client.listPages({
      status: args.status,
      path: args.path,
      pathPrefix: args.pathPrefix,
      space: args.space,
      filterType: args.filterType,
      filterInputKind: args.filterInputKind,
      filterCategoryId: args.filterCategoryId,
      filterTag: args.filterTag,
      createdStart: args.createdStart ? new Date(args.createdStart) : undefined,
      createdEnd: args.createdEnd ? new Date(args.createdEnd) : undefined,
      order: args.order,
      limit: args.limit,
      cursor: args.cursor,
    });
    return listPagesResponse(response);
  }

  // Cross-space fan-out: cursor pagination is not composable across spaces
  // (the server-side cursor encodes a single space + sort key).
  if (args.cursor) {
    throw new Error(
      'Cursor pagination is not supported when searching across all spaces. ' +
        'Pass an explicit "space" parameter to enable pagination.',
    );
  }

  // Apply space-specific filters only to the spaces they apply to.
  // - filterType applies to the generated space (OKF frontmatter)
  // - filterInputKind / filterCategoryId apply to the raw space
  const buildArgs = (space: ContentSpace) => ({
    status: args.status,
    path: args.path,
    pathPrefix: args.pathPrefix,
    space,
    filterType: space === 'generated' ? args.filterType : undefined,
    filterInputKind: space === 'raw' ? args.filterInputKind : undefined,
    filterCategoryId: space === 'raw' ? args.filterCategoryId : undefined,
    filterTag: args.filterTag,
    createdStart: args.createdStart ? new Date(args.createdStart) : undefined,
    createdEnd: args.createdEnd ? new Date(args.createdEnd) : undefined,
    order: args.order,
    limit: args.limit,
  });

  const responses = await Promise.all(
    ALL_CONTENT_SPACES.map((space) => client.listPages(buildArgs(space))),
  );

  // Dedupe by page id. Path uniqueness is enforced across the whole wiki
  // so a single page can never appear in two spaces — the dedupe is defensive.
  const seen = new Map<string, PublicPageResource>();
  for (const response of responses) {
    for (const page of response.items) {
      seen.set(page.id, page);
    }
  }

  const merged = Array.from(seen.values());
  const sorted = sortPagesByOrder(merged, args.order);
  const limited = sorted.slice(0, args.limit ?? 20);

  return listPagesResponse({ items: limited, nextCursor: null });
}

function sortPagesByOrder(
  pages: PublicPageResource[],
  order: ListPagesInput['order'],
): PublicPageResource[] {
  if (!order || order === 'recent') {
    // 'recent' is server-defined; trust per-space ordering from each response.
    return pages;
  }
  const cmp = (key: keyof PublicPageResource, direction: 1 | -1) =>
    (a: PublicPageResource, b: PublicPageResource) => {
      const av = String(a[key] ?? '');
      const bv = String(b[key] ?? '');
      return av.localeCompare(bv) * direction;
    };
  const copy = [...pages];
  if (order === 'path') return copy.sort(cmp('path', 1));
  if (order === 'createdAtAsc') return copy.sort(cmp('createdAt', 1));
  if (order === 'createdAtDesc') return copy.sort(cmp('createdAt', -1));
  if (order === 'updatedAtAsc') return copy.sort(cmp('updatedAt', 1));
  if (order === 'updatedAtDesc') return copy.sort(cmp('updatedAt', -1));
  return copy;
}