import { z } from 'zod';
import { publicRawSourceSchema, type WikiApiClient } from '../api-client';
import { saveDraftResponse } from '../shapes';

export const appendRawEntrySchema = {
  pageId: z.string().uuid().describe('Raw entry page identifier'),
  content: z.string().min(1).max(1_000_000).describe('New immutable chunk to append (extracted text; stored verbatim)'),
  source: publicRawSourceSchema.optional().describe('Immutable source metadata for this appended chunk'),
  contentType: z.string().optional().describe('MIME type of the appended chunk (RFC 2046). Defaults to text/markdown.'),
  originalBytes: z.string().optional().describe('Optional base64 original payload for this chunk, stored as immutable original bytes.'),
};
export type AppendRawEntryInput = z.infer<z.ZodObject<typeof appendRawEntrySchema>>;

export async function appendRawEntry(client: WikiApiClient, args: AppendRawEntryInput) {
  const response = await client.appendRawEntry(args.pageId, {
    content: args.content,
    source: args.source,
    contentType: args.contentType,
    originalBytes: args.originalBytes,
  });
  return saveDraftResponse(response);
}
