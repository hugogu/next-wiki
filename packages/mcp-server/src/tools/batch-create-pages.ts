import { z } from 'zod';
import { contentSpaceSchema, type WikiApiClient } from '../api-client';

export const batchCreatePagesSchema = {
  pages: z
    .array(
      z.object({
        path: z.string().describe('Canonical path'),
        title: z.string().describe('Page title'),
        contentSource: z.string().describe('Markdown source'),
        locale: z.string().optional().describe('Locale (defaults to workspace default)'),
        space: contentSpaceSchema.optional().describe("Target content space. MCP defaults to 'generated' per page; pass 'default' or 'raw' to override."),
      }),
    )
    .min(1)
    .max(50)
    .describe('1-50 page definitions'),
};
export type BatchCreatePagesInput = z.infer<z.ZodObject<typeof batchCreatePagesSchema>>;

export async function batchCreatePages(client: WikiApiClient, args: BatchCreatePagesInput) {
  // Same default as create-page: every MCP call is AI-authored, so each page
  // defaults to the generated space unless the caller overrides per-page.
  const pages = args.pages.map((page) => ({
    ...page,
    space: page.space ?? 'generated',
  }));
  const response = await client.batchCreatePages({ pages });
  return { created: response.created, count: response.count };
}
