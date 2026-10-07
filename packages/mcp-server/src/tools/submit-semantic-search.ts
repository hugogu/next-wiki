import { z } from 'zod';
import type { WikiApiClient } from '../api-client';
import { submitSemanticSearchResponse } from '../shapes';
import { booleanArg, numberArg } from './_scalar-args';

export const submitSemanticSearchSchema = {
  includeAiGenerated: booleanArg().optional().describe('Include AI-generated pages; defaults to true'),
  includeAiAssisted: booleanArg().optional().describe('Include AI-assisted pages; defaults to true'),
  query: z.string().min(1).max(8_000).describe('Natural-language query'),
  limit: numberArg(z.number().int().min(1).max(50)).optional().describe('Max results; defaults to 10'),
  pathPrefix: z.string().optional().describe('Restrict matching to a directory subtree'),
  filterTag: z.string().optional().describe('Frontmatter tag filter'),
  filterStatus: z.string().optional().describe('Frontmatter status filter'),
  filterOwner: z.string().optional().describe('Frontmatter owner filter'),
  filterHasFrontmatter: booleanArg().optional().describe('Filter by frontmatter presence'),
};
export type SubmitSemanticSearchInput = z.infer<z.ZodObject<typeof submitSemanticSearchSchema>>;

export async function submitSemanticSearch(client: WikiApiClient, args: SubmitSemanticSearchInput) {
  const response = await client.submitSemanticSearch({
    q: args.query,
    includeAiGenerated: args.includeAiGenerated,
    includeAiAssisted: args.includeAiAssisted,
    limit: args.limit ?? 10,
    pathPrefix: args.pathPrefix,
    filterTag: args.filterTag,
    filterStatus: args.filterStatus,
    filterOwner: args.filterOwner,
    filterHasFrontmatter: args.filterHasFrontmatter,
  });
  return submitSemanticSearchResponse(response);
}
