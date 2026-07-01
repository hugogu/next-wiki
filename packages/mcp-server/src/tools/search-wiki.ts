import { z } from 'zod';
import type { WikiApiClient } from '../api-client';
import { searchWikiResponse } from '../shapes';

export const searchWikiSchema = {
  query: z.string().min(1).max(200).describe('Search term'),
  scope: z.enum(['path', 'title', 'content', 'all']).optional().describe('Search scope; defaults to all'),
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
};
export type SearchWikiInput = z.infer<z.ZodObject<typeof searchWikiSchema>>;

export async function searchWiki(client: WikiApiClient, args: SearchWikiInput) {
  const response = await client.searchPages({
    q: args.query,
    scope: args.scope,
    limit: args.limit,
    excerptLength: args.excerptLength,
    createdStart: args.createdStart ? new Date(args.createdStart) : undefined,
    createdEnd: args.createdEnd ? new Date(args.createdEnd) : undefined,
    updatedStart: args.updatedStart ? new Date(args.updatedStart) : undefined,
    updatedEnd: args.updatedEnd ? new Date(args.updatedEnd) : undefined,
  });
  return searchWikiResponse(response);
}
