import { z } from 'zod';
import type { WikiApiClient } from '../api-client';
import { searchWikiResponse } from '../shapes';

export const searchWikiSchema = {
  query: z.string().min(1).max(200).describe('Search term'),
  scope: z.enum(['path', 'title', 'content', 'all']).optional().describe('Search scope; defaults to all'),
  limit: z.number().int().min(1).max(100).optional().describe('Maximum results; defaults to 20'),
};
export type SearchWikiInput = z.infer<z.ZodObject<typeof searchWikiSchema>>;

export async function searchWiki(client: WikiApiClient, args: SearchWikiInput) {
  const response = await client.searchPages({
    q: args.query,
    scope: args.scope,
    limit: args.limit,
  });
  return searchWikiResponse(response);
}
