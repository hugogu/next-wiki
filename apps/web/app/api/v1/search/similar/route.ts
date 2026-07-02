import { publicSimilarQuerySchema } from '@next-wiki/shared';
import { parsePublicJson, publicJson, withPublicApi } from '../../_shared/route';
import * as publicContent from '@/server/services/public-content';

/**
 * Find pages similar to a proposed title/path.
 *
 * @openapi
 * @summary Find similar public wiki pages
 * @description Checks whether existing pages are likely duplicates of a proposed title or path.
 * @tag Public Wiki Content
 * @auth bearer
 * @body PublicSimilarQuery
 * @response PublicSimilarResponse
 */
export const POST = withPublicApi(async (request, _context, ctx) => {
  const parsed = await parsePublicJson(request, publicSimilarQuerySchema);
  if (!parsed.ok) return parsed.response;
  return publicJson(await publicContent.findSimilar(ctx, parsed.data));
});
