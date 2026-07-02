import { z } from 'zod';
import type { WikiApiClient } from '../api-client';

export const getBacklinksSchema = {
  pageId: z.string().uuid().describe('ID of the target page'),
};
export type GetBacklinksInput = z.infer<z.ZodObject<typeof getBacklinksSchema>>;

export async function getBacklinks(client: WikiApiClient, args: GetBacklinksInput) {
  const response = await client.getBacklinks(args.pageId);
  return { backlinks: response.items };
}
