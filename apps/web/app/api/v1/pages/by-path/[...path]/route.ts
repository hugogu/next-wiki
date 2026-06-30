import { z } from 'zod';
import { publicApiError, validationError } from '@/server/api/public-errors';
import { publicJson, withPublicApi } from '../../../_shared/route';
import * as publicContent from '@/server/services/public-content';

const paramsSchema = z.object({ path: z.array(z.string().min(1)).min(1).max(20) });

function getPath(path: string[]): string {
  return path.map((segment) => decodeURIComponent(segment)).join('/');
}

/**
 * Get a page by canonical path.
 *
 * @openapi
 * @summary Get public wiki page by path
 * @description Returns public page metadata and readable Markdown source for a canonical page path.
 * @tag Public Wiki Content
 * @auth bearer
 * @pathParams PublicPagePathParams
 * @response PublicPageResource
 */
export const GET = withPublicApi<{ path: string[] }>(async (_request, { params }, ctx) => {
  const parsed = paramsSchema.safeParse(await params);
  if (!parsed.success) return validationError(parsed.error);

  const page = await publicContent.getPageByPath(ctx, getPath(parsed.data.path));
  if (!page) return publicApiError('NOT_FOUND', 'Page not found', 404);
  return publicJson(page);
});
