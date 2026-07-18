import { z } from 'zod';
import { publicRawSourceSchema, type WikiApiClient } from '../api-client';
import { saveDraftResponse } from '../shapes';

export const appendRawEntrySchema = {
  pageId: z.string().uuid().describe('Raw entry page identifier'),
  content: z.string().min(1).max(1_000_000).describe('New immutable Markdown chunk to append'),
  source: publicRawSourceSchema.optional().describe('Immutable source metadata for this appended chunk'),
};
export type AppendRawEntryInput = z.infer<z.ZodObject<typeof appendRawEntrySchema>>;

export async function appendRawEntry(client: WikiApiClient, args: AppendRawEntryInput) {
  const response = await client.appendRawEntry(args.pageId, {
    content: args.content,
    source: args.source,
  });
  return saveDraftResponse(response);
}
