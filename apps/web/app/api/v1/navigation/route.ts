import { publicPageNavigationQuerySchema } from '@next-wiki/shared';
import { parsePublicQuery, publicJson, withPublicApi } from '../_shared/route';
import { getCachedPageNavigation, getPageNavigation } from '@/server/services/page-navigation';

/**
 * Read a shallow navigation projection.
 *
 * @openapi
 * @summary Get path-scoped page navigation
 * @description Returns direct children of path in current mode, or root and ancestor levels in tree mode.
 *   Descendants are represented by hasChildren without transferring their metadata. Permissions apply
 *   before grouping; pageCount counts page-backed nodes included in this projection. Anonymous published data uses the shared server cache; HTTP responses are no-store.
 * @tag Tree
 * @auth bearer
 * @queryParams PublicPageNavigationQuery
 * @response PublicPageTreeResponse
 */
export const GET = withPublicApi(async (request, _context, ctx) => {
  const parsed = parsePublicQuery(request, publicPageNavigationQuerySchema);
  if (!parsed.ok) return parsed.response;
  const result = ctx.actor.kind === 'anonymous'
    ? await getCachedPageNavigation(parsed.data)
    : await getPageNavigation(ctx, parsed.data);
  return publicJson(result);
});
