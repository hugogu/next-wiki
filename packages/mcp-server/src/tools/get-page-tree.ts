import { z } from 'zod';
import { contentSpaceSchema, type WikiApiClient } from '../api-client';
import { pageTreeResponse } from '../shapes';

export const getPageTreeSchema = {
  status: z.enum(['published', 'draft', 'all']).optional().describe('Filter by status; defaults to published'),
  pathPrefix: z
    .string()
    .optional()
    .describe('Scope the tree to a subdirectory (e.g. "docs" returns only the docs/ branch)'),
  space: contentSpaceSchema.optional().describe('Content space to inspect'),
  filterType: z.string().min(1).max(200).optional().describe('Exact frontmatter type filter for leaf pages'),
};
export type GetPageTreeInput = z.infer<z.ZodObject<typeof getPageTreeSchema>>;

export async function getPageTree(client: WikiApiClient, args: GetPageTreeInput) {
  const response = await client.getPageTree({
    status: args.status,
    pathPrefix: args.pathPrefix,
    space: args.space,
    filterType: args.filterType,
  });
  return pageTreeResponse(response);
}
