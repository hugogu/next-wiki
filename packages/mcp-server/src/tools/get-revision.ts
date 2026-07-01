import { z } from 'zod';
import type { WikiApiClient } from '../api-client';
import { getRevisionResponse } from '../shapes';

export const getRevisionSchema = {
  pageId: z.string().uuid().describe('Page UUID'),
  version: z.number().int().min(1).describe('Revision version number'),
};
export type GetRevisionInput = z.infer<z.ZodObject<typeof getRevisionSchema>>;

export async function getRevision(client: WikiApiClient, args: GetRevisionInput) {
  const response = await client.getRevision(args.pageId, args.version);
  return getRevisionResponse(response);
}
