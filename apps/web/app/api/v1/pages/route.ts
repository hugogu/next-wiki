import { publicPageCreateInputSchema, publicPageListQuerySchema } from '@next-wiki/shared';
import { parsePublicJson, parsePublicQuery, publicJson, withPublicApi } from '../_shared/route';
import * as publicContent from '@/server/services/public-content';

/**
 * List pages visible to the caller.
 *
 * @openapi
 * @summary List public wiki pages
 * @description Lists pages visible to the caller through the stable Public Wiki Content API.
 * @tag Public Wiki Content
 * @auth bearer
 * @queryParams PublicPageListQuery
 * @response PublicPageListResponse
 */
export const GET = withPublicApi(async (request, _context, ctx) => {
  const parsed = parsePublicQuery(request, publicPageListQuerySchema);
  if (!parsed.ok) return parsed.response;
  return publicJson(await publicContent.listPages(ctx, parsed.data));
});

/**
 * Create a page and its first draft revision.
 *
 * @openapi
 * @summary Create public wiki page
 * @description Creates a page through the stable Public Wiki Content API.
 * @tag Public Wiki Content
 * @auth bearer
 * @body PublicPageCreateInput
 * @response 201:PublicPageResource
 */
export const POST = withPublicApi(async (request, _context, ctx) => {
  const parsed = await parsePublicJson(request, publicPageCreateInputSchema);
  if (!parsed.ok) return parsed.response;
  return publicJson(await publicContent.createPage(ctx, parsed.data), { status: 201 });
});
