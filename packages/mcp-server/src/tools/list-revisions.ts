import { z } from 'zod';
import type { WikiApiClient } from '../api-client';
import { listRevisionsResponse } from '../shapes';

export const listRevisionsSchema = {
  pageId: z.string().uuid().describe('Page UUID'),
  status: z.enum(['published', 'draft', 'all']).optional().describe('Filter by revision status'),
  limit: z.number().int().min(1).max(100).optional().describe('Maximum results; defaults to 20'),
  cursor: z.string().optional().describe('Pagination cursor'),
};
export type ListRevisionsInput = z.infer<z.ZodObject<typeof listRevisionsSchema>>;

export async function listRevisions(client: WikiApiClient, args: ListRevisionsInput) {
  const response = await client.listRevisions(args.pageId, {
    status: args.status,
    limit: args.limit,
    cursor: args.cursor,
  });
  return listRevisionsResponse(response);
}
