import { z } from 'zod';
import { publicPageIncludeQuerySchema, publicPagePropertiesInputSchema } from '@next-wiki/shared';
import { publicApiError, validationError } from '@/server/api/public-errors';
import { parsePublicJson, parsePublicQuery, publicJson, withPublicApi } from '../../_shared/route';
import * as publicContent from '@/server/services/public-content';

const paramsSchema = z.object({ id: z.string().uuid() });

/**
 * Get a page by stable id.
 *
 * @openapi
 * @summary Get public wiki page by id
 * @description Returns public page metadata and readable Markdown source for a stable page id.
 *   latestRevision/publishedRevision are omitted unless requested via
 *   ?include=latestRevision,publishedRevision.
 * @tag Public Wiki Content
 * @auth bearer
 * @pathParams PublicPageIdPathParams
 * @queryParams PublicPageIncludeQuery
 * @response PublicPageResource
 */
export const GET = withPublicApi<{ id: string }>(async (request, { params }, ctx) => {
  const parsedParams = paramsSchema.safeParse(await params);
  if (!parsedParams.success) return validationError(parsedParams.error);

  const parsedQuery = parsePublicQuery(request, publicPageIncludeQuerySchema);
  if (!parsedQuery.ok) return parsedQuery.response;

  const page = await publicContent.getPageById(ctx, parsedParams.data.id, parsedQuery.data.include);
  if (!page) return publicApiError('NOT_FOUND', 'Page not found', 404);
  return publicJson(page);
});

/**
 * Update page properties (title and/or canonical path).
 *
 * @openapi
 * @summary Update public wiki page
 * @description Updates page title and/or canonical path through the public content API.
 * @tag Public Wiki Content
 * @auth bearer
 * @pathParams PublicPageIdPathParams
 * @queryParams PublicPageIncludeQuery
 * @body PublicPagePropertiesInput
 * @response PublicPageResource
 */
export const PATCH = withPublicApi<{ id: string }>(async (request, { params }, ctx) => {
  const parsedParams = paramsSchema.safeParse(await params);
  if (!parsedParams.success) return validationError(parsedParams.error);

  const parsedQuery = parsePublicQuery(request, publicPageIncludeQuerySchema);
  if (!parsedQuery.ok) return parsedQuery.response;

  const parsedBody = await parsePublicJson(request, publicPagePropertiesInputSchema);
  if (!parsedBody.ok) return parsedBody.response;

  return publicJson(await publicContent.updateProperties(ctx, parsedParams.data.id, parsedBody.data, parsedQuery.data.include));
});
