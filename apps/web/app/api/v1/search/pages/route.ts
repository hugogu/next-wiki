import { hybridPageSearchInputSchema, publicPageSearchQuerySchema } from '@next-wiki/shared';
import { parsePublicJson, parsePublicQuery, publicJson, withPublicApi } from '../../_shared/route';
import * as publicContent from '@/server/services/public-content';
import * as searchAnalytics from '@/server/services/search-analytics';

/**
 * Search public wiki pages visible to the caller.
 *
 * @openapi
 * @summary Search public wiki pages
 * @description Searches readable pages by path, title, or Markdown source. Optionally
 *   filter by createdStart/createdEnd/updatedStart/updatedEnd. Results include a
 *   relevance score and are sorted by score descending within each returned page.
 * @tag Search
 * @auth bearer
 * @queryParams PublicPageSearchQuery
 * @response PublicPageSearchResponse
 */
export const GET = withPublicApi(async (request, _context, ctx) => {
  const parsed = parsePublicQuery(request, publicPageSearchQuerySchema);
  if (!parsed.ok) return parsed.response;
  return publicJson(await publicContent.searchPages(ctx, parsed.data));
});

/**
 * @openapi
 * @summary Run or resume a Header hybrid page search, or record a search behavior
 * @description Extends the existing page-search resource without changing legacy GET search callers.
 * @tag Search
 * @auth bearer
 * @body HybridPageSearchInput
 * @response HybridPageSearchResponse
 */
export const POST = withPublicApi(async (request, _context, ctx) => {
  const parsed = await parsePublicJson(request, hybridPageSearchInputSchema);
  if (!parsed.ok) return parsed.response;
  if (parsed.data.kind === 'query') return publicJson(await publicContent.hybridSearchPages(ctx, parsed.data));

  if ((parsed.data.action === 'result_open' && !parsed.data.pageId) || (parsed.data.action === 'escape' && parsed.data.pageId)) {
    return new Response(JSON.stringify({ code: 'VALIDATION_FAILED', message: 'Invalid search behavior payload' }), { status: 422, headers: { 'content-type': 'application/json' } });
  }
  if (parsed.data.action === 'result_open') {
    const page = await publicContent.getPageById(ctx, parsed.data.pageId!);
    if (!page) return new Response(null, { status: 204 });
  }
  try {
    await searchAnalytics.recordSearchBehavior(ctx, parsed.data);
  } catch (error) {
    // Analytics must not delay navigation or make leaving search fail. The
    // response remains idempotent, and the failure is still visible to ops.
    console.error('Failed to persist search behavior analytics:', error);
  }
  return new Response(null, { status: 204 });
});
