import { z } from 'zod';
import type { WikiApiClient } from '../api-client';
import { getPageResponse } from '../shapes';

export const updatePageMetadataSchema = {
  pageId: z.string().uuid(), baseRevisionId: z.string().uuid(), title: z.string().min(1).max(200).optional(),
  date: z.string().nullable().optional(), tags: z.array(z.string()).nullable().optional(), summary: z.string().nullable().optional(),
};
export async function updatePageMetadata(client: WikiApiClient, args: z.infer<z.ZodObject<typeof updatePageMetadataSchema>>) {
  return getPageResponse(await client.updatePageMetadata(args.pageId, args));
}
