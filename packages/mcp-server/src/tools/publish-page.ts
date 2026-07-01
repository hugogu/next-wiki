import { z } from 'zod';
import type { WikiApiClient } from '../api-client';
import { publishPageResponse } from '../shapes';

export const publishPageSchema = {
  pageId: z.string().uuid().describe('Page UUID'),
  version: z.number().int().min(1).describe('Revision version number to publish'),
  expectedRevisionId: z.string().uuid().optional().describe('Revision UUID for optimistic concurrency'),
};
export type PublishPageInput = z.infer<z.ZodObject<typeof publishPageSchema>>;

export async function publishPage(client: WikiApiClient, args: PublishPageInput) {
  const response = await client.publishPage(args.pageId, args.version, {
    expectedRevisionId: args.expectedRevisionId,
  });
  return publishPageResponse(response);
}
