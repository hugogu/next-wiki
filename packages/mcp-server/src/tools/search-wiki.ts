import { z } from 'zod';
import { contentSpaceSchema, publicRawInputKindSchema, type WikiApiClient } from '../api-client';
import { searchWikiResponse } from '../shapes';

// 046: 'all' (or omitting the field entirely) asks the server to fan out
// across every space this API key may read — the server resolves that
// server-side in one query, scoped by the key's own space-access grant.
export const searchWikiSpaceSchema = z
  .union([contentSpaceSchema, z.literal('all')])
  .optional()
  .describe(
    'Content space to search: default wiki, raw evidence, or generated concepts. ' +
      'Pass "all" or omit to search across every space this API key can read.',
  );

export const searchWikiSchema = {
  query: z.string().min(1).max(200).describe('Search term'),
  scope: z.enum(['path', 'title', 'content', 'all']).optional().describe('Search scope; defaults to all'),
  pathPrefix: z.string().optional().describe('Restrict matching to pages under a directory subtree (e.g. "docs")'),
  space: searchWikiSpaceSchema,
  filterType: z.string().min(1).max(200).optional().describe('Exact OKF frontmatter type filter (generated space only)'),
  filterInputKind: publicRawInputKindSchema.optional().describe('Raw-only: exact capture-channel filter, independent from filterType'),
  filterCategoryId: z.string().uuid().optional().describe('Raw-only: taxonomy category id filter, independent from filterType'),
  limit: z.number().int().min(1).max(100).optional().describe('Maximum results; defaults to 20'),
  excerptLength: z
    .number()
    .int()
    .min(20)
    .max(500)
    .optional()
    .describe('Approximate characters of context around the matched keyword in each excerpt; defaults to 100'),
  createdStart: z.string().datetime().optional().describe('Only include pages created at or after this ISO 8601 timestamp'),
  createdEnd: z.string().datetime().optional().describe('Only include pages created at or before this ISO 8601 timestamp'),
  updatedStart: z.string().datetime().optional().describe('Only include pages last updated at or after this ISO 8601 timestamp'),
  updatedEnd: z.string().datetime().optional().describe('Only include pages last updated at or before this ISO 8601 timestamp'),
  filterTag: z.string().optional().describe('Structured page tag filter (normalized exact match)'),
  filterStatus: z.string().optional().describe('Frontmatter status filter (exact match)'),
  filterOwner: z.string().optional().describe('Frontmatter owner filter (exact match)'),
  filterHasFrontmatter: z.boolean().optional().describe('Filter for pages with / without any frontmatter'),
  order: z.enum(['relevance', 'createdAtAsc', 'createdAtDesc', 'updatedAtAsc', 'updatedAtDesc']).optional().describe('Result order; use createdAtDesc for newest pages first instead of relevance'),
};
export type SearchWikiInput = z.infer<z.ZodObject<typeof searchWikiSchema>>;

export async function searchWiki(client: WikiApiClient, args: SearchWikiInput) {
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
