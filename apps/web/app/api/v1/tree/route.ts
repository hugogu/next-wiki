import { publicFolderDeleteQuerySchema, publicPageTreeQuerySchema } from '@next-wiki/shared';
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

/**
 * Soft-delete every page under a folder path prefix.
 *
 * @openapi
 * @summary Soft-delete a folder subtree
 * @description Soft-deletes every page at or under `pathPrefix` in the requested space
 *   (the default wiki space when `space` is omitted). The delete is all-or-nothing: every
 *   page inside is permission-checked first and any rejection fails the whole request.
 *   Pass ?dry_run=true to preview how many pages the delete would touch. Raw-space folders
 *   are deletable by admins; raw entries otherwise remain immutable.
 * @tag Tree
 * @auth bearer
 * @queryParams PublicFolderDeleteQuery
 * @response PublicFolderDeleteResult
 */
export const DELETE = withPublicApi(async (request, _context, ctx) => {
  const parsed = parsePublicQuery(request, publicFolderDeleteQuerySchema);
  if (!parsed.ok) return parsed.response;
  return publicJson(await publicContent.deleteFolder(ctx, parsed.data));
});
