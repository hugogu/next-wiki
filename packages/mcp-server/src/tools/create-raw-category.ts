import { z } from 'zod';
import { type WikiApiClient } from '../api-client';
import { rawCategoryShape } from '../shapes';

export const createRawCategorySchema = {
  name: z.string().min(1).max(100).describe('Human-readable category name'),
  slug: z.string().min(1).max(100).describe('URL-safe slug (lowercase letters, numbers, hyphens)'),
  description: z.string().max(2000).optional().describe('Optional description'),
  isDefault: z.boolean().optional().describe('Apply as the default category for raw creates that omit categoryId'),
};
export type CreateRawCategoryInput = z.infer<z.ZodObject<typeof createRawCategorySchema>>;

export async function createRawCategory(client: WikiApiClient, args: CreateRawCategoryInput) {
  return rawCategoryShape(await client.createRawCategory({
    name: args.name,
    slug: args.slug,
    description: args.description,
    isDefault: args.isDefault,
  }));
}
