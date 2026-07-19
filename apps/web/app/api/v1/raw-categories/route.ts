import { publicRawCategoryCreateInputSchema } from '@next-wiki/shared';
import { parsePublicJson, publicJson, withPublicApi } from '../_shared/route';
import * as rawCategories from '@/server/services/raw-categories';

/**
 * List the raw taxonomy categories.
 *
 * @openapi
 * @summary List raw categories
 * @description Lists the admin-managed raw taxonomy. Every raw entry is filed under exactly one immutable category; use these ids as `categoryId` when creating raw entries. Admin-scoped; available only in LLM Wiki mode.
 * @tag Raw
 * @auth bearer
 * @response PublicRawCategoryListResponse
 */
export const GET = withPublicApi(async (_request, _context, ctx) => {
  return publicJson({ items: await rawCategories.listCategories(ctx) });
});

/**
 * Create a raw taxonomy category.
 *
 * @openapi
 * @summary Create a raw category
 * @description Creates a raw taxonomy category. Set `isDefault` to have it applied when a raw entry is created without an explicit `categoryId`. Admin-scoped; available only in LLM Wiki mode.
 * @tag Raw
 * @auth bearer
 * @body PublicRawCategoryCreateInput
 * @response 201:PublicRawCategory
 */
export const POST = withPublicApi(async (request, _context, ctx) => {
  const parsed = await parsePublicJson(request, publicRawCategoryCreateInputSchema);
  if (!parsed.ok) return parsed.response;
  return publicJson(await rawCategories.createCategory(ctx, parsed.data), { status: 201 });
});
