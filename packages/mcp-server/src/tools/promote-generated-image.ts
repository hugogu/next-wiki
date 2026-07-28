import { z } from 'zod';
import type { WikiApiClient } from '../api-client';
import { promoteGeneratedImageResponse } from '../shapes';

export const promoteGeneratedImageSchema = {
  artifactId: z.string().uuid().describe('Generated image artifact id returned by get_image_generation'),
  pageId: z.string().uuid().describe('Page bound to the image action'),
};
export type PromoteGeneratedImageInput = z.infer<z.ZodObject<typeof promoteGeneratedImageSchema>>;

export async function promoteGeneratedImage(client: WikiApiClient, args: PromoteGeneratedImageInput) {
  return promoteGeneratedImageResponse(await client.promoteGeneratedImage(args.artifactId, args.pageId));
}
