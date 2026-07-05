import { z } from 'zod';
import type { WikiApiClient } from '../api-client';
import { getNeighborhoodResponse } from '../shapes';

export const getNeighborhoodSchema = {
  node: z.string().uuid().describe('The root page id'),
  depth: z.number().int().min(1).max(3).optional().describe('Traversal depth bound (1-3); defaults to 1'),
  direction: z.enum(['out', 'in', 'both']).optional().describe('Which edges to follow; defaults to out'),
};
export type GetNeighborhoodInput = z.infer<z.ZodObject<typeof getNeighborhoodSchema>>;

export async function getNeighborhood(client: WikiApiClient, args: GetNeighborhoodInput) {
  const response = await client.getNeighborhood(args.node, args.depth, args.direction);
  return getNeighborhoodResponse(response);
}
