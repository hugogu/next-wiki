import { z } from 'zod';
import { publicApiError, validationError } from '@/server/api/public-errors';
import { publicJson, withPublicApi } from '../../../../_shared/route';
import * as publicContent from '@/server/services/public-content';

const paramsSchema = z.object({
  id: z.string().uuid(),
  version: z.coerce.number().int().min(1),
});

/**
 * Get a visible page revision.
 *
 * @openapi
 * @summary Get public wiki page revision
 * @description Returns visible revision metadata and readable Markdown source.
 * @tag Revisions
 * @auth bearer
 * @pathParams PublicPageRevisionPathParams
 * @response PublicRevisionResource
 */
export const GET = withPublicApi<{ id: string; version: string }>(async (_request, { params }, ctx) => {
  const parsedParams = paramsSchema.safeParse(await params);
  if (!parsedParams.success) return validationError(parsedParams.error);

  const revision = await publicContent.getRevision(ctx, parsedParams.data.id, parsedParams.data.version);
  if (!revision) return publicApiError('NOT_FOUND', 'Revision not found', 404);
  return publicJson(revision);
});
