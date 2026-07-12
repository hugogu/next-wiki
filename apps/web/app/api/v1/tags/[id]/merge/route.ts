import { z } from 'zod';
import { publicTagMergeInputSchema } from '@next-wiki/shared';
import { parsePublicJson, publicJson, withPublicApi } from '../../../_shared/route';
import { validationError } from '@/server/api/public-errors';
import * as tags from '@/server/services/tags';

const paramsSchema = z.object({ id: z.string().uuid() });

/**
 * @openapi
 * @summary Merge tag into another tag
 * @tag Tags
 * @auth bearer
 * @pathParams PublicTagIdPathParams
 * @body PublicTagMergeInput
 * @response 202:PublicTagMutation
 */
export const POST = withPublicApi<{ id: string }>(async (request, { params }, ctx) => {
  const parsed = paramsSchema.safeParse(await params);
  if (!parsed.success) return validationError(parsed.error);
  const body = await parsePublicJson(request, publicTagMergeInputSchema);
  if (!body.ok) return body.response;
  return publicJson(await tags.requestTagMerge(ctx, parsed.data.id, body.data.targetTagId), { status: 202 });
});
