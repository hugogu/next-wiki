import { z } from 'zod';
import { publicRawAppendInputSchema } from '@next-wiki/shared';
import { validationError } from '@/server/api/public-errors';
import { parsePublicJson, publicJson, withPublicApi } from '../../../_shared/route';
import * as publicContent from '@/server/services/public-content';

const paramsSchema = z.object({ id: z.string().uuid() });

/**
 * Append an immutable chunk to a raw entry.
 *
 * @openapi
 * @summary Append raw entry content
 * @description Appends Markdown to a raw entry, creating and publishing an immutable next revision.
 * @tag Pages
 * @auth bearer
 * @pathParams PublicPageIdPathParams
 * @body PublicRawAppendInput
 * @response 201:PublicRevisionResource
 */
export const POST = withPublicApi<{ id: string }>(async (request, { params }, ctx) => {
  const parsedParams = paramsSchema.safeParse(await params);
  if (!parsedParams.success) return validationError(parsedParams.error);

  const parsedBody = await parsePublicJson(request, publicRawAppendInputSchema);
  if (!parsedBody.ok) return parsedBody.response;

  return publicJson(await publicContent.appendRawEntry(ctx, parsedParams.data.id, parsedBody.data), { status: 201 });
});
