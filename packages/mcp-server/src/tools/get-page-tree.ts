import { z } from 'zod';
import type { WikiApiClient } from '../api-client';
import { pageTreeResponse } from '../shapes';

export const getPageTreeSchema = {
  status: z.enum(['published', 'draft', 'all']).optional().describe('Filter by status; defaults to published'),
  pathPrefix: z
    .string()
    .optional()
    .describe('Scope the tree to a subdirectory (e.g. "docs" returns only the docs/ branch)'),
};
export type GetPageTreeInput = z.infer<z.ZodObject<typeof getPageTreeSchema>>;

export async function getPageTree(client: WikiApiClient, args: GetPageTreeInput) {
  const response = await client.getPageTree({
    status: args.status,
    pathPrefix: args.pathPrefix,
  });
  return pageTreeResponse(response);
}
