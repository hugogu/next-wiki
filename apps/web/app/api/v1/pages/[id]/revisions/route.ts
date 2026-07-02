import { z } from 'zod';
import { publicRevisionListQuerySchema } from '@next-wiki/shared';
import { validationError } from '@/server/api/public-errors';
import { parsePublicQuery, publicJson, withPublicApi } from '../../../_shared/route';
import * as publicContent from '@/server/services/public-content';

const paramsSchema = z.object({ id: z.string().uuid() });

/**
 * List visible revisions for a page.
 *
 * @openapi
 * @summary List public wiki page revisions
 * @description Lists revisions visible to the caller.
 * @tag Revisions
 * @auth bearer
 * @pathParams PublicPageIdPathParams
 * @queryParams PublicRevisionListQuery
 * @response PublicRevisionListResponse
 */
export const GET = withPublicApi<{ id: string }>(async (request, { params }, ctx) => {
  const parsedParams = paramsSchema.safeParse(await params);
  if (!parsedParams.success) return validationError(parsedParams.error);

  const parsedQuery = parsePublicQuery(request, publicRevisionListQuerySchema);
  if (!parsedQuery.ok) return parsedQuery.response;

  return publicJson(await publicContent.listRevisions(ctx, parsedParams.data.id, parsedQuery.data));
});
