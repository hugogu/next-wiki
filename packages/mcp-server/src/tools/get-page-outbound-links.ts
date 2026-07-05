import { z } from 'zod';
import type { WikiApiClient } from '../api-client';
import { getOutboundLinksResponse } from '../shapes';

export const getPageOutboundLinksSchema = {
  pageId: z.string().uuid().describe('The page id'),
};
export type GetPageOutboundLinksInput = z.infer<z.ZodObject<typeof getPageOutboundLinksSchema>>;

export async function getPageOutboundLinks(client: WikiApiClient, args: GetPageOutboundLinksInput) {
  const response = await client.getOutboundLinks(args.pageId);
  return getOutboundLinksResponse(response);
}
