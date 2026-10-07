import { z } from 'zod';
import type { WikiApiClient } from '../api-client';
import { saveDraftResponse } from '../shapes';
import { bodyFilePathSchema, resolveBody } from './_page-body';

export const saveDraftSchema = {
  pageId: z.string().uuid().describe('Page UUID'),
  title: z.string().min(1).max(200).describe('Title for the draft'),
  contentSource: z
    .string()
    .min(1)
    .optional()
    .describe('Markdown source content, passed inline (not a file path; use filePath to read a file). Provide exactly one of contentSource or filePath.'),
  filePath: bodyFilePathSchema,
  baseRevisionId: z.string().uuid().optional().describe('Revision ID the edit is based on; stale conflict if page changed'),
};
export type SaveDraftInput = z.infer<z.ZodObject<typeof saveDraftSchema>>;

export async function saveDraft(client: WikiApiClient, args: SaveDraftInput) {
  const contentSource = await resolveBody(args.contentSource, args.filePath);
  if (contentSource === undefined) {
    throw new Error('Provide exactly one of contentSource or filePath.');
  }
  const response = await client.saveDraft(args.pageId, {
    title: args.title,
    contentSource,
    baseRevisionId: args.baseRevisionId,
  });
  return saveDraftResponse(response);
}
