import { z } from 'zod';
import { contentSpaceSchema, publicRawInputKindSchema, type WikiApiClient } from '../api-client';
import { listPagesResponse } from '../shapes';

// 046: 'all' (or omitting the field entirely) asks the server to fan out
// across every space this API key may read — the server resolves that
// server-side in one query, scoped by the key's own space-access grant.
export const listPagesSpaceSchema = z
  .union([contentSpaceSchema, z.literal('all')])
  .optional()
  .describe(
    'Content space to search: default wiki, raw evidence, or generated concepts. ' +
      'Pass "all" or omit to search across every space this API key can read.',
  );

export const listPagesSchema = {
  status: z.enum(['published', 'draft', 'all']).optional().describe('Filter by status; defaults to published'),
  path: z.string().optional().describe('Exact path lookup (returns at most one)'),
  pathPrefix: z.string().optional().describe('List all pages under a directory subtree (e.g. "docs")'),
  space: listPagesSpaceSchema,
  filterType: z.string().min(1).max(200).optional().describe('Exact OKF frontmatter type filter (generated space only)'),
  filterInputKind: publicRawInputKindSchema.optional().describe('Raw-only: exact capture-channel filter, independent from filterType'),
  filterCategoryId: z.string().uuid().optional().describe('Raw-only: taxonomy category id filter, independent from filterType'),
  filterTag: z.string().min(1).max(100).optional().describe('Structured page tag filter (normalized exact match)'),
  createdStart: z.string().datetime().optional().describe('Only include pages created at or after this ISO 8601 timestamp'),
  createdEnd: z.string().datetime().optional().describe('Only include pages created at or before this ISO 8601 timestamp'),
  order: z.enum(['path', 'recent', 'createdAtAsc', 'createdAtDesc', 'updatedAtAsc', 'updatedAtDesc']).optional().describe('Result order; use createdAtDesc for newest pages first'),
  limit: z.number().int().min(1).max(100).optional().describe('Maximum results; defaults to 20'),
  cursor: z.string().optional().describe('Pagination cursor from previous call'),
};
export type ListPagesInput = z.infer<z.ZodObject<typeof listPagesSchema>>;

export async function listPages(client: WikiApiClient, args: ListPagesInput) {
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
