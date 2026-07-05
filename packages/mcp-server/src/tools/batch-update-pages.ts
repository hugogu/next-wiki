import { z } from 'zod';
import type { WikiApiClient } from '../api-client';
import { batchUpdatePagesResponse } from '../shapes';

export const batchUpdatePagesSchema = {
  items: z
    .array(
      z.object({
        pageId: z.string().uuid().describe('Page id to update'),
        title: z.string().min(1).max(200).optional().describe('New title'),
        path: z.string().optional().describe('New canonical path'),
        frontmatter: z
          .record(z.unknown().nullable())
          .optional()
          .describe('Frontmatter patch: keys present are written, null removes a key, absent keys are preserved'),
        baseRevisionId: z.string().uuid().describe('Expected current latest revision id, for stale detection'),
      }),
    )
    .min(1)
    .max(50)
    .describe('1-50 items to update; not transactional across items'),
  dryRun: z.boolean().optional().describe('If true, returns a per-item preview without writing; defaults to false'),
};
export type BatchUpdatePagesInput = z.infer<z.ZodObject<typeof batchUpdatePagesSchema>>;

export async function batchUpdatePages(client: WikiApiClient, args: BatchUpdatePagesInput) {
  const response = await client.batchUpdatePages({ items: args.items }, { dryRun: args.dryRun ?? false });
  return batchUpdatePagesResponse(response);
}
