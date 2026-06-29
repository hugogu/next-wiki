import { z } from 'zod';
import { publicApiError, validationError } from '@/server/api/public-errors';
import { publicJson, withPublicApi } from '../../_shared/route';
import * as publicContent from '@/server/services/public-content';

const paramsSchema = z.object({ id: z.string().uuid() });

/**
 * Get a page by stable id.
 *
 * @openapi
 * @summary Get public wiki page by id
 * @description Returns public page metadata and readable Markdown source for a stable page id.
 * @tag Public Wiki Content
 * @auth bearer
 * @response PublicPageResource
 */
export const GET = withPublicApi<{ id: string }>(async (_request, { params }, ctx) => {
  const parsed = paramsSchema.safeParse(await params);
  if (!parsed.success) return validationError(parsed.error);

  const page = await publicContent.getPageById(ctx, parsed.data.id);
  if (!page) return publicApiError('NOT_FOUND', 'Page not found', 404);
  return publicJson(page);
});
