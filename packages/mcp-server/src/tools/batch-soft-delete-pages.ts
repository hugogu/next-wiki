import { z } from 'zod';
import type { WikiApiClient } from '../api-client';
import { batchSoftDeletePagesResponse } from '../shapes';

export const batchSoftDeletePagesSchema = {
  pageIds: z.array(z.string().uuid()).min(1).max(50).describe('1-50 page ids to soft-delete; not transactional across items'),
  dryRun: z.boolean().optional().describe('If true, returns a per-item preview without deleting; defaults to false'),
};
export type BatchSoftDeletePagesInput = z.infer<z.ZodObject<typeof batchSoftDeletePagesSchema>>;

export async function batchSoftDeletePages(client: WikiApiClient, args: BatchSoftDeletePagesInput) {
  const response = await client.batchSoftDeletePages({ pageIds: args.pageIds }, { dryRun: args.dryRun ?? false });
  return batchSoftDeletePagesResponse(response);
}
