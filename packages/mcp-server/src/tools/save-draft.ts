import { z } from 'zod';
import type { WikiApiClient } from '../api-client';
import { saveDraftResponse } from '../shapes';

export const saveDraftSchema = {
  pageId: z.string().uuid().describe('Page UUID'),
  title: z.string().min(1).max(200).describe('Title for the draft'),
  contentSource: z.string().min(1).describe('Markdown source content'),
  baseRevisionId: z.string().uuid().optional().describe('Revision ID the edit is based on; stale conflict if page changed'),
};
export type SaveDraftInput = z.infer<z.ZodObject<typeof saveDraftSchema>>;

export async function saveDraft(client: WikiApiClient, args: SaveDraftInput) {
  const response = await client.saveDraft(args.pageId, {
    title: args.title,
    contentSource: args.contentSource,
    baseRevisionId: args.baseRevisionId,
  });
  return saveDraftResponse(response);
}
