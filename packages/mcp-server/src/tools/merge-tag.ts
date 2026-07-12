import { z } from 'zod';
import type { WikiApiClient } from '../api-client';

export const mergeTagSchema = { tagId: z.string().uuid(), targetTagId: z.string().uuid() };
export async function mergeTag(client: WikiApiClient, args: z.infer<z.ZodObject<typeof mergeTagSchema>>) {
  return client.mergeTag(args.tagId, args.targetTagId);
}
