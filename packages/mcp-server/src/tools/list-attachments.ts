import { z } from 'zod';
import type { WikiApiClient } from '../api-client';
import { listAttachmentsResponse } from '../shapes';

export const listAttachmentsSchema = {
  pageId: z.string().uuid().describe('Id of the page whose attachments to list'),
};
export type ListAttachmentsInput = z.infer<z.ZodObject<typeof listAttachmentsSchema>>;

/**
 * List a page's current attachments. Needs only the credential's existing
 * read access to the page — no independent scope (spec FR-003b).
 */
export async function listAttachments(client: WikiApiClient, args: ListAttachmentsInput) {
  const response = await client.listAttachments(args.pageId);
  return listAttachmentsResponse(response);
}
