import { publicTagCreateInputSchema, publicTagListQuerySchema } from '@next-wiki/shared';
import { parsePublicJson, parsePublicQuery, publicJson, withPublicApi } from '../_shared/route';
import * as tags from '@/server/services/tags';

/**
 * @openapi
 * @summary List tags
 * @tag Tags
 * @auth bearer
 * @queryParams PublicTagListQuery
 */
export const GET = withPublicApi(async (request, _context, ctx) => {
  const query = parsePublicQuery(request, publicTagListQuerySchema);
  if (!query.ok) return query.response;
  return publicJson(await tags.listTags(ctx, query.data));
});

/**
 * @openapi
 * @summary Create tag
 * @tag Tags
 * @auth bearer
 * @body PublicTagCreateInput
 * @response PublicTag
 */
export const POST = withPublicApi(async (request, _context, ctx) => {
  const body = await parsePublicJson(request, publicTagCreateInputSchema);
  if (!body.ok) return body.response;
  return publicJson(await tags.createTag(ctx, body.data.name), { status: 201 });
});
