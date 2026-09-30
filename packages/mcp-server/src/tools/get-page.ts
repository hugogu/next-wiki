import { z } from 'zod';
import type { WikiApiClient } from '../api-client';
import { getPageResponse } from '../shapes';

export const getPageSchema = {
  pageId: z.string().uuid().optional().describe('Page UUID; supply either pageId or url.'),
  url: z.string().min(1).max(2048).optional().describe('Wiki reader URL or relative reader address, e.g. https://kb.example.com/generated/my-article or /generated/my-article. Prefer this when the user provides a link; no search or listing needed.'),
};
export type GetPageInput = z.infer<z.ZodObject<typeof getPageSchema>>;

export async function getPage(client: WikiApiClient, args: GetPageInput) {
  if (Boolean(args.pageId) === Boolean(args.url)) {
    throw new Error('Provide exactly one of pageId or url. For a user-provided link, pass url directly.');
  }
  const response = args.pageId ? await client.getPage(args.pageId) : await client.getPageByUrl(args.url!);
  const addresses = await client.listAddresses(response.id).catch(() => null);
  return getPageResponse(response, addresses?.aliases);
}
