import { z } from 'zod';
import { publicPageIncludeQuerySchema, publicPublicationInputSchema } from '@next-wiki/shared';
import { validationError } from '@/server/api/public-errors';
import { parsePublicJson, parsePublicQuery, publicJson, withPublicApi } from '../../../../../_shared/route';
import * as publicContent from '@/server/services/public-content';

const paramsSchema = z.object({
  id: z.string().uuid(),
  version: z.coerce.number().int().min(1),
});

/**
 * Publish a page revision.
 *
 * @openapi
 * @summary Publish public wiki page revision
 * @description Publishes an eligible draft revision and returns the updated public page resource.
 * @tag Public Wiki Content
 * @auth bearer
 * @pathParams PublicPageRevisionPathParams
 * @queryParams PublicPageIncludeQuery
 * @body PublicPublicationInput
 * @response PublicPageResource
 */
export const POST = withPublicApi<{ id: string; version: string }>(async (request, { params }, ctx) => {
  const parsedParams = paramsSchema.safeParse(await params);
  if (!parsedParams.success) return validationError(parsedParams.error);

  const parsedQuery = parsePublicQuery(request, publicPageIncludeQuerySchema);
  if (!parsedQuery.ok) return parsedQuery.response;

  const parsedBody = await parsePublicJson(request, publicPublicationInputSchema);
  if (!parsedBody.ok) return parsedBody.response;

  return publicJson(
    await publicContent.publishRevision(ctx, parsedParams.data.id, parsedParams.data.version, parsedBody.data, parsedQuery.data.include),
  );
});
