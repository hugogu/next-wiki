import { z } from 'zod';
import { contentSpaceSchema, type WikiApiClient } from '../api-client';

export const getStatsSchema = {
  includeOrphans: z
    .boolean()
    .optional()
    .describe('Include pages with zero inbound links (default false)'),
  space: contentSpaceSchema.optional().describe('Content space to summarize'),
};
export type GetStatsInput = z.infer<z.ZodObject<typeof getStatsSchema>>;

export async function getStats(client: WikiApiClient, args: GetStatsInput) {
  return client.getStats({
    ...(args.includeOrphans !== undefined ? { includeOrphans: args.includeOrphans } : {}),
    ...(args.space ? { space: args.space } : {}),
  });
}
