import { z } from 'zod';
import { contentSpaceSchema, publicRawInputKindSchema, type WikiApiClient } from '../api-client';
import { listPagesResponse } from '../shapes';

export const listPagesSchema = {
  status: z.enum(['published', 'draft', 'all']).optional().describe('Filter by status; defaults to published'),
  path: z.string().optional().describe('Exact path lookup (returns at most one)'),
  pathPrefix: z.string().optional().describe('List all pages under a directory subtree (e.g. "docs")'),
  space: contentSpaceSchema.optional().describe('Content space to search: default wiki, raw evidence, or generated concepts'),
  filterType: z.string().min(1).max(200).optional().describe('Exact OKF frontmatter type filter (generated space only)'),
  filterInputKind: publicRawInputKindSchema.optional().describe('Raw-only: exact capture-channel filter, independent from filterType'),
  filterCategoryId: z.string().uuid().optional().describe('Raw-only: taxonomy category id filter, independent from filterType'),
  filterTag: z.string().min(1).max(100).optional().describe('Structured page tag filter (normalized exact match)'),
  createdStart: z.string().datetime().optional().describe('Only include pages created at or after this ISO 8601 timestamp'),
  createdEnd: z.string().datetime().optional().describe('Only include pages created at or before this ISO 8601 timestamp'),
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
    limit: args.limit,
    cursor: args.cursor,
  });
  return listPagesResponse(response);
}
