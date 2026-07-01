import { z } from 'zod';
import type { WikiApiClient } from '../api-client';
import { createPageResponse } from '../shapes';

export const createPageSchema = {
  path: z
    .string()
    .min(1)
    .max(200)
    .describe('Canonical page path, e.g. docs/getting-started'),
  title: z.string().min(1).max(200).describe('Page title'),
  contentSource: z.string().min(1).describe('Markdown source content'),
  locale: z.string().min(1).max(20).optional().describe('Locale; defaults to wiki default'),
};
export type CreatePageInput = z.infer<z.ZodObject<typeof createPageSchema>>;

export async function createPage(client: WikiApiClient, args: CreatePageInput) {
  const response = await client.createPage({
    path: args.path,
    title: args.title,
    contentSource: args.contentSource,
    locale: args.locale,
  });
  return createPageResponse(response);
}
