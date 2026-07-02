import { z } from 'zod';
import type { WikiApiClient } from '../api-client';

export const getStatsSchema = {
  includeOrphans: z
    .boolean()
    .optional()
    .describe('Include pages with zero inbound links (default false)'),
};
export type GetStatsInput = z.infer<z.ZodObject<typeof getStatsSchema>>;

export async function getStats(client: WikiApiClient, args: GetStatsInput) {
  return client.getStats({ includeOrphans: args.includeOrphans });
}
