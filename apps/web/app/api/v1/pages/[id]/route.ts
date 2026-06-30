import { z } from 'zod';
import { publicPagePropertiesInputSchema } from '@next-wiki/shared';
import { publicApiError, validationError } from '@/server/api/public-errors';
import { parsePublicJson, publicJson, withPublicApi } from '../../_shared/route';
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
 * @pathParams PublicPageIdPathParams
 * @response PublicPageResource
 */
export const GET = withPublicApi<{ id: string }>(async (_request, { params }, ctx) => {
  const parsed = paramsSchema.safeParse(await params);
  if (!parsed.success) return validationError(parsed.error);

  const page = await publicContent.getPageById(ctx, parsed.data.id);
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
 * @body PublicPagePropertiesInput
 * @response PublicPageResource
 */
export const PATCH = withPublicApi<{ id: string }>(async (request, { params }, ctx) => {
  const parsedParams = paramsSchema.safeParse(await params);
  if (!parsedParams.success) return validationError(parsedParams.error);

  const parsedBody = await parsePublicJson(request, publicPagePropertiesInputSchema);
  if (!parsedBody.ok) return parsedBody.response;

  return publicJson(await publicContent.updateProperties(ctx, parsedParams.data.id, parsedBody.data));
});
