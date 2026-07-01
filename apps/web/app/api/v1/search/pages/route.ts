import { publicPageSearchQuerySchema } from '@next-wiki/shared';
import { parsePublicQuery, publicJson, withPublicApi } from '../../_shared/route';
import * as publicContent from '@/server/services/public-content';

/**
 * Search public wiki pages visible to the caller.
 *
 * @openapi
 * @summary Search public wiki pages
 * @description Searches readable pages by path, title, or Markdown source. Optionally
 *   filter by createdStart/createdEnd/updatedStart/updatedEnd. Results include a
 *   relevance score and are sorted by score descending within each returned page.
 * @tag Public Wiki Content
 * @auth bearer
 * @queryParams PublicPageSearchQuery
 * @response PublicPageSearchResponse
 */
export const GET = withPublicApi(async (request, _context, ctx) => {
  const parsed = parsePublicQuery(request, publicPageSearchQuerySchema);
  if (!parsed.ok) return parsed.response;
  return publicJson(await publicContent.searchPages(ctx, parsed.data));
});
