import { z } from 'zod';
import { publicPagePropertiesInputSchema } from '@next-wiki/shared';
import { validationError } from '@/server/api/public-errors';
import { parsePublicJson, publicJson, withPublicApi } from '../../../_shared/route';
import * as publicContent from '@/server/services/public-content';

const paramsSchema = z.object({ id: z.string().uuid() });

/**
 * Update page properties.
 *
 * @openapi
 * @summary Update public wiki page properties
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
