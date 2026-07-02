import { publicPageTreeQuerySchema } from '@next-wiki/shared';
import { parsePublicQuery, publicJson, withPublicApi } from '../_shared/route';
import * as publicContent from '@/server/services/public-content';

/**
 * Get the directory tree of visible pages.
 *
 * @openapi
 * @summary Get public wiki page tree
 * @description Returns the hierarchical directory structure of pages visible to the caller.
 *   Each node carries its full path, the last path segment, and — when a page exists at that
 *   path — the page id, title, and status. Intermediate segments with no page are represented
 *   as branch nodes (pageId null). Use ?pathPrefix= to scope the tree to a subdirectory.
 * @tag Tree
 * @auth bearer
 * @queryParams PublicPageTreeQuery
 * @response PublicPageTreeResponse
 */
export const GET = withPublicApi(async (request, _context, ctx) => {
  const parsed = parsePublicQuery(request, publicPageTreeQuerySchema);
  if (!parsed.ok) return parsed.response;
  return publicJson(await publicContent.getPageTree(ctx, parsed.data));
});
