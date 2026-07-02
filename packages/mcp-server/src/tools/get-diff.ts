import { z } from 'zod';
import type { WikiApiClient } from '../api-client';

export const getDiffSchema = {
  pageId: z.string().uuid().describe('Page ID'),
  version: z.number().int().min(1).describe('The "to" version'),
  against: z.number().int().min(1).describe('The "from" version to diff against'),
};
export type GetDiffInput = z.infer<z.ZodObject<typeof getDiffSchema>>;

export async function getDiff(client: WikiApiClient, args: GetDiffInput) {
  return client.getDiff(args.pageId, args.version, args.against);
}
