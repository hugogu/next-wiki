import { z } from 'zod';
import type { WikiApiClient } from '../api-client';
import { getPageResponse } from '../shapes';

export const getPageSchema = {
  pageId: z.string().uuid().describe('Page UUID'),
};
export type GetPageInput = z.infer<z.ZodObject<typeof getPageSchema>>;

export async function getPage(client: WikiApiClient, args: GetPageInput) {
  const [response, addresses] = await Promise.all([
    client.getPage(args.pageId),
    client.listAddresses(args.pageId).catch(() => null),
  ]);
  return getPageResponse(response, addresses?.aliases);
}
