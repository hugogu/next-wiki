import { z } from 'zod';
import {
  contentSpaceSchema,
  publicRawInputKindSchema,
  type ContentSpace,
  type PublicPageResource,
  type PublicPageSearchResponse,
  type WikiApiClient,
} from '../api-client';
import { searchWikiResponse } from '../shapes';

// 046: extend the space enum with 'all' so callers can search across all spaces
// by passing 'all' or omitting the parameter. Existing callers that pass a
// concrete space (default/raw/generated) see no behavior change.
const searchWikiSpaceSchema = z
  .union([contentSpaceSchema, z.literal('all')])
  .optional()
  .describe(
    'Content space to search: default wiki, raw evidence, or generated concepts. ' +
      'Pass "all" or omit to search across all three spaces.',
  );

const ALL_CONTENT_SPACES: readonly ContentSpace[] = ['default', 'raw', 'generated'] as const;

export const searchWikiSchema = {
  query: z.string().min(1).max(200).describe('Search term'),
  scope: z
    .enum(['path', 'title', 'content', 'all'])
    .optional()
    .describe('Search scope; defaults to all'),
  pathPrefix: z
    .string()
    .optional()
    .describe('Restrict matching to pages under a directory subtree (e.g. "docs")'),
  space: searchWikiSpaceSchema,
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
  limit: z
    .number()
    .int()
    .min(1)
    .max(100)
    .optional()
    .describe('Maximum results; defaults to 20'),
  excerptLength: z
    .number()
    .int()
    .min(20)
    .max(500)
    .optional()
    .describe('Approximate characters of context around the matched keyword in each excerpt; defaults to 100'),
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
  updatedStart: z
    .string()
    .datetime()
    .optional()
    .describe('Only include pages last updated at or after this ISO 8601 timestamp'),
  updatedEnd: z
    .string()
    .datetime()
    .optional()
    .describe('Only include pages last updated at or before this ISO 8601 timestamp'),
  filterTag: z.string().optional().describe('Structured page tag filter (normalized exact match)'),
  filterStatus: z.string().optional().describe('Frontmatter status filter (exact match)'),
  filterOwner: z.string().optional().describe('Frontmatter owner filter (exact match)'),
  filterHasFrontmatter: z
    .boolean()
    .optional()
    .describe('Filter for pages with / without any frontmatter'),
  order: z
    .enum(['relevance', 'createdAtAsc', 'createdAtDesc', 'updatedAtAsc', 'updatedAtDesc'])
    .optional()
    .describe('Result order; use createdAtDesc for newest pages first instead of relevance'),
};
export type SearchWikiInput = z.infer<z.ZodObject<typeof searchWikiSchema>>;

export async function searchWiki(client: WikiApiClient, args: SearchWikiInput) {
  const wantsAllSpaces = args.space === undefined || args.space === 'all';

  if (!wantsAllSpaces) {
    const response = await client.searchPages({
      q: args.query,
      scope: args.scope,
      pathPrefix: args.pathPrefix,
      space: args.space,
      filterType: args.filterType,
      filterInputKind: args.filterInputKind,
      filterCategoryId: args.filterCategoryId,
      limit: args.limit,
      excerptLength: args.excerptLength,
      createdStart: args.createdStart ? new Date(args.createdStart) : undefined,
      createdEnd: args.createdEnd ? new Date(args.createdEnd) : undefined,
      updatedStart: args.updatedStart ? new Date(args.updatedStart) : undefined,
      updatedEnd: args.updatedEnd ? new Date(args.updatedEnd) : undefined,
      filterTag: args.filterTag,
      filterStatus: args.filterStatus,
      filterOwner: args.filterOwner,
      filterHasFrontmatter: args.filterHasFrontmatter,
      order: args.order,
    });
    return searchWikiResponse(response);
  }

  // Cross-space fan-out: search has no cursor support, so a single
  // combined result is naturally returned.
  // Apply space-specific filters only to the spaces they apply to.
  const buildArgs = (space: ContentSpace) => ({
    q: args.query,
    scope: args.scope,
    pathPrefix: args.pathPrefix,
    space,
    filterType: space === 'generated' ? args.filterType : undefined,
    filterInputKind: space === 'raw' ? args.filterInputKind : undefined,
    filterCategoryId: space === 'raw' ? args.filterCategoryId : undefined,
    limit: args.limit,
    excerptLength: args.excerptLength,
    createdStart: args.createdStart ? new Date(args.createdStart) : undefined,
    createdEnd: args.createdEnd ? new Date(args.createdEnd) : undefined,
    updatedStart: args.updatedStart ? new Date(args.updatedStart) : undefined,
    updatedEnd: args.updatedEnd ? new Date(args.updatedEnd) : undefined,
    filterTag: args.filterTag,
    filterStatus: args.filterStatus,
    filterOwner: args.filterOwner,
    filterHasFrontmatter: args.filterHasFrontmatter,
    order: args.order,
  });

  const responses = await Promise.all(
    ALL_CONTENT_SPACES.map((space) => client.searchPages(buildArgs(space))),
  );

  // Dedupe by page id; preserve first-seen ordering across spaces.
  const seen = new Set<string>();
  const items: PublicPageSearchResponse['items'] = [];
  for (const response of responses) {
    for (const item of response.items) {
      if (!seen.has(item.page.id)) {
        seen.add(item.page.id);
        items.push(item);
      }
    }
  }

  const sorted = sortSearchItems(items, args.order);
  const limited = sorted.slice(0, args.limit ?? 20);

  return searchWikiResponse({ items: limited, nextCursor: null });
}

function sortSearchItems(
  items: PublicPageSearchResponse['items'],
  order: SearchWikiInput['order'],
): PublicPageSearchResponse['items'] {
  if (!order || order === 'relevance') {
    // Server relevance scores aren't comparable across spaces, so trust
    // per-space ordering as a reasonable approximation.
    return items;
  }
  const cmp = (
    key: keyof PublicPageResource,
    direction: 1 | -1,
  ): ((a: PublicPageSearchResponse['items'][number], b: PublicPageSearchResponse['items'][number]) => number) =>
    (a, b) => {
      const av = String(a.page[key] ?? '');
      const bv = String(b.page[key] ?? '');
      return av.localeCompare(bv) * direction;
    };
  const copy = [...items];
  if (order === 'createdAtAsc') return copy.sort(cmp('createdAt', 1));
  if (order === 'createdAtDesc') return copy.sort(cmp('createdAt', -1));
  if (order === 'updatedAtAsc') return copy.sort(cmp('updatedAt', 1));
  if (order === 'updatedAtDesc') return copy.sort(cmp('updatedAt', -1));
  return copy;
}