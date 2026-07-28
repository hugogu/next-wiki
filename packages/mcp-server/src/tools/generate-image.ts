import { z } from 'zod';
import type { WikiApiClient } from '../api-client';
import { generateImageResponse } from '../shapes';

export const generateImageSchema = {
  pageId: z.string().uuid().describe('Page that owns the image action'),
  revisionId: z.string().uuid().describe('Current editable revision used as the source'),
  source: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('page').describe('Use the full bound page revision') }),
    z.object({
      kind: z.literal('selection'),
      text: z.string().min(1).max(100_000).describe('Selected text from the bound revision'),
      hash: z.string().min(16).max(128).describe('Hash of the selected text'),
    }),
  ]).describe('Page-bound source. URLs, bytes, batches, and image editing are unsupported.'),
  aspectRatio: z.enum(['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9']).optional(),
};
export type GenerateImageInput = z.infer<z.ZodObject<typeof generateImageSchema>>;

export async function generateImage(client: WikiApiClient, args: GenerateImageInput) {
  return generateImageResponse(await client.generateImage(args));
}
