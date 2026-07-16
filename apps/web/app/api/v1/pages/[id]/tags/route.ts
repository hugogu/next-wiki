import { z } from 'zod';
import { publicPageTagsInputSchema } from '@next-wiki/shared';
import { parsePublicJson, publicJson, withPublicApi } from '../../../_shared/route';
import { validationError } from '@/server/api/public-errors';
import * as publicContent from '@/server/services/public-content';

const paramsSchema = z.object({ id: z.string().uuid() });

/**
 * Replace a page's tags.
 *
 * @openapi
 * @summary Replace page tags
 * @description Sets the page's tag list and publishes the change immediately so the live page reflects it.
 * @tag Pages
 * @auth bearer
 * @body PublicPageTagsInput
 * @response PublicPageResource
 */
export const PUT = withPublicApi<{ id: string }>(async (request, { params }, ctx) => {
  const parsedParams = paramsSchema.safeParse(await params);
  if (!parsedParams.success) return validationError(parsedParams.error);
  const body = await parsePublicJson(request, publicPageTagsInputSchema);
  if (!body.ok) return body.response;
  return publicJson(await publicContent.setPageTags(ctx, parsedParams.data.id, body.data.tags));
});
