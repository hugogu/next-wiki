import { z } from 'zod';
import type { WikiApiClient } from '../api-client';

export const deleteRevisionSchema = {
  pageId: z.string().uuid().describe('ID of the page the revision belongs to'),
  version: z.number().int().min(1).describe('Revision version number to soft-delete'),
};
export type DeleteRevisionInput = z.infer<z.ZodObject<typeof deleteRevisionSchema>>;

export async function deleteRevision(client: WikiApiClient, args: DeleteRevisionInput) {
  await client.deleteRevision(args.pageId, args.version);
  return { deleted: true, pageId: args.pageId, version: args.version };
}
