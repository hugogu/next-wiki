import { z } from 'zod';
import type { WikiApiClient } from '../api-client';
import { updatePropertiesResponse } from '../shapes';

export const updatePagePropertiesSchema = {
  pageId: z.string().uuid().describe('Page UUID'),
  title: z.string().min(1).max(200).optional().describe('New page title'),
  path: z
    .string()
    .min(1)
    .max(200)
    .optional()
    .describe('New canonical page path'),
  baseRevisionId: z.string().uuid().optional().describe('Stale guard when changing properties after reading page'),
};
export type UpdatePagePropertiesInput = z.infer<z.ZodObject<typeof updatePagePropertiesSchema>>;

export async function updatePageProperties(client: WikiApiClient, args: UpdatePagePropertiesInput) {
  if (!args.title && !args.path) {
    throw new Error('Provide either title or path to update');
  }

  const response = await client.updatePageProperties(args.pageId, {
    title: args.title,
    path: args.path,
    baseRevisionId: args.baseRevisionId,
  });
  return updatePropertiesResponse(response);
}
