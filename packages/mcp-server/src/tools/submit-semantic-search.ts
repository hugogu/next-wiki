import { z } from 'zod';
import type { WikiApiClient } from '../api-client';
import { submitSemanticSearchResponse } from '../shapes';

export const submitSemanticSearchSchema = {
  query: z.string().min(1).max(8_000).describe('Natural-language query'),
  limit: z.number().int().min(1).max(50).optional().describe('Max results; defaults to 10'),
  pathPrefix: z.string().optional().describe('Restrict matching to a directory subtree'),
  filterTag: z.string().optional().describe('Frontmatter tag filter'),
  filterStatus: z.string().optional().describe('Frontmatter status filter'),
  filterOwner: z.string().optional().describe('Frontmatter owner filter'),
  filterHasFrontmatter: z.boolean().optional().describe('Filter by frontmatter presence'),
};
export type SubmitSemanticSearchInput = z.infer<z.ZodObject<typeof submitSemanticSearchSchema>>;

export async function submitSemanticSearch(client: WikiApiClient, args: SubmitSemanticSearchInput) {
  const response = await client.submitSemanticSearch({
    q: args.query,
    limit: args.limit ?? 10,
    pathPrefix: args.pathPrefix,
    filterTag: args.filterTag,
    filterStatus: args.filterStatus,
    filterOwner: args.filterOwner,
    filterHasFrontmatter: args.filterHasFrontmatter,
  });
  return submitSemanticSearchResponse(response);
}
