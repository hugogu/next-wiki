import { z } from 'zod';
import type { WikiApiClient } from '../api-client';
import { getImageGenerationResponse } from '../shapes';

export const getImageGenerationSchema = {
  actionId: z.string().uuid().describe('Image generation action id returned by generate_image'),
};
export type GetImageGenerationInput = z.infer<z.ZodObject<typeof getImageGenerationSchema>>;

export async function getImageGeneration(client: WikiApiClient, args: GetImageGenerationInput) {
  return getImageGenerationResponse(await client.getImageGeneration(args.actionId));
}
