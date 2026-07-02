import { z } from 'zod';
import type { WikiApiClient } from '../api-client';

export const batchCreatePagesSchema = {
  pages: z
    .array(
      z.object({
        path: z.string().describe('Canonical path'),
        title: z.string().describe('Page title'),
        contentSource: z.string().describe('Markdown source'),
        locale: z.string().optional().describe('Locale (defaults to workspace default)'),
      }),
    )
    .min(1)
    .max(50)
    .describe('1-50 page definitions'),
};
export type BatchCreatePagesInput = z.infer<z.ZodObject<typeof batchCreatePagesSchema>>;

export async function batchCreatePages(client: WikiApiClient, args: BatchCreatePagesInput) {
  const response = await client.batchCreatePages({ pages: args.pages });
  return { created: response.created, count: response.count };
}
