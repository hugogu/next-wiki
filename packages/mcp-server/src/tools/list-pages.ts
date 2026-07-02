import { z } from 'zod';
import type { WikiApiClient } from '../api-client';
import { listPagesResponse } from '../shapes';

export const listPagesSchema = {
  status: z.enum(['published', 'draft', 'all']).optional().describe('Filter by status; defaults to published'),
  path: z.string().optional().describe('Exact path lookup (returns at most one)'),
  pathPrefix: z.string().optional().describe('List all pages under a directory subtree (e.g. "docs")'),
  limit: z.number().int().min(1).max(100).optional().describe('Maximum results; defaults to 20'),
  cursor: z.string().optional().describe('Pagination cursor from previous call'),
};
export type ListPagesInput = z.infer<z.ZodObject<typeof listPagesSchema>>;

export async function listPages(client: WikiApiClient, args: ListPagesInput) {
  const response = await client.listPages({
    status: args.status,
    path: args.path,
    pathPrefix: args.pathPrefix,
    limit: args.limit,
    cursor: args.cursor,
  });
  return listPagesResponse(response);
}
