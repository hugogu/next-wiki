import { z } from 'zod';
import { publicDraftCreateInputSchema } from '@next-wiki/shared';
import { validationError } from '@/server/api/public-errors';
import { parsePublicJson, publicJson, withPublicApi } from '../../../_shared/route';
import * as publicContent from '@/server/services/public-content';

const paramsSchema = z.object({ id: z.string().uuid() });

/**
 * Create a draft revision for a page.
 *
 * @openapi
 * @summary Create public wiki page draft
 * @description Creates a new draft revision from Markdown source.
 * @tag Public Wiki Content
 * @auth bearer
 * @pathParams PublicPageIdPathParams
 * @body PublicDraftCreateInput
 * @response 201:PublicRevisionResource
 */
export const POST = withPublicApi<{ id: string }>(async (request, { params }, ctx) => {
  const parsedParams = paramsSchema.safeParse(await params);
  if (!parsedParams.success) return validationError(parsedParams.error);

  const parsedBody = await parsePublicJson(request, publicDraftCreateInputSchema);
  if (!parsedBody.ok) return parsedBody.response;

  return publicJson(await publicContent.createDraft(ctx, parsedParams.data.id, parsedBody.data), { status: 201 });
});
