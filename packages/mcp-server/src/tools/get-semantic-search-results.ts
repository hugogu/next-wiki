import { z } from 'zod';
import type { WikiApiClient } from '../api-client';
import { getSemanticSearchResultsResponse } from '../shapes';

export const getSemanticSearchResultsSchema = {
  id: z.string().uuid().describe('The semantic search action id returned by submit_semantic_search'),
};
export type GetSemanticSearchResultsInput = z.infer<z.ZodObject<typeof getSemanticSearchResultsSchema>>;

export async function getSemanticSearchResults(client: WikiApiClient, args: GetSemanticSearchResultsInput) {
  const response = await client.getSemanticSearchResults(args.id);
  return getSemanticSearchResultsResponse(response);
}
