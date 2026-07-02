import { z } from 'zod';
import type { WikiApiClient } from '../api-client';

export const deletePageSchema = {
  pageId: z.string().uuid().describe('ID of the page to soft-delete'),
};
export type DeletePageInput = z.infer<z.ZodObject<typeof deletePageSchema>>;

export async function deletePage(client: WikiApiClient, args: DeletePageInput) {
  await client.deletePage(args.pageId);
  return { deleted: true, id: args.pageId };
}
