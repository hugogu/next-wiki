import { publicStatsQuerySchema } from '@next-wiki/shared';
import { parsePublicQuery, publicJson, withPublicApi } from '../_shared/route';
import * as publicContent from '@/server/services/public-content';

/**
 * Get aggregate wiki statistics.
 *
 * @openapi
 * @summary Get public wiki stats
 * @description Returns page counts, recent activity, directory breakdown, and optional orphan detection.
 * @tag Stats
 * @auth bearer
 * @queryParams PublicStatsQuery
 * @response PublicStatsResponse
 */
export const GET = withPublicApi(async (request, _context, ctx) => {
  const parsed = parsePublicQuery(request, publicStatsQuerySchema);
  if (!parsed.ok) return parsed.response;
  return publicJson(
    await publicContent.getStats(ctx, { includeOrphans: parsed.data.include === 'orphans' }),
  );
});
