import { publicNeighborhoodQuerySchema } from '@next-wiki/shared';
import { parsePublicQuery, publicJson, withPublicApi } from '../../_shared/route';
import * as publicContent from '@/server/services/public-content';

/**
 * Get the multi-hop neighborhood of a page.
 *
 * @openapi
 * @summary Get public wiki page neighborhood
 * @description Returns the bounded multi-hop link neighborhood of a page (depth 1-3),
 *   following outbound links, inbound links, or both.
 * @tag Pages
 * @auth bearer
 * @queryParams PublicNeighborhoodQuery
 * @response PublicNeighborhoodResponse
 */
export const GET = withPublicApi(async (request, _context, ctx) => {
  const parsed = parsePublicQuery(request, publicNeighborhoodQuerySchema);
  if (!parsed.ok) return parsed.response;
  return publicJson(await publicContent.getNeighborhood(ctx, parsed.data.node, parsed.data.depth, parsed.data.direction));
});
