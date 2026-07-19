import { type WikiApiClient } from '../api-client';
import { listRawCategoriesResponse } from '../shapes';

export const listRawCategoriesSchema = {};
export type ListRawCategoriesInput = Record<string, never>;

export async function listRawCategories(client: WikiApiClient) {
  return listRawCategoriesResponse(await client.listRawCategories());
}
