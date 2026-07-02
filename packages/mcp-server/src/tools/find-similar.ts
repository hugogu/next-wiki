import { z } from 'zod';
import type { WikiApiClient } from '../api-client';

export const findSimilarSchema = {
  title: z.string().optional().describe('Proposed page title'),
  path: z.string().optional().describe('Proposed page path'),
  threshold: z.number().min(0).max(1).optional().describe('Minimum similarity score [0,1], default 0.5'),
};
export type FindSimilarInput = z.infer<z.ZodObject<typeof findSimilarSchema>>;

export async function findSimilar(client: WikiApiClient, args: FindSimilarInput) {
  return client.findSimilar({
    title: args.title,
    path: args.path,
    threshold: args.threshold,
  });
}
