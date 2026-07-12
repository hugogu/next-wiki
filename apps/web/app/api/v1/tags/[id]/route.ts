import { z } from 'zod';
import { publicTagRenameInputSchema } from '@next-wiki/shared';
import { parsePublicJson, publicJson, withPublicApi } from '../../_shared/route';
import { validationError } from '@/server/api/public-errors';
import * as tags from '@/server/services/tags';

const paramsSchema = z.object({ id: z.string().uuid() });

/**
 * @openapi
 * @summary Rename tag
 * @tag Tags
 * @auth bearer
 * @pathParams PublicTagIdPathParams
 * @body PublicTagRenameInput
 * @response 202:PublicTagMutation
 */
export const PATCH = withPublicApi<{ id: string }>(async (request, { params }, ctx) => {
  const parsed = paramsSchema.safeParse(await params);
  if (!parsed.success) return validationError(parsed.error);
  const body = await parsePublicJson(request, publicTagRenameInputSchema);
  if (!body.ok) return body.response;
  return publicJson(await tags.requestTagMutation(ctx, parsed.data.id, 'rename', body.data.name), { status: 202 });
});

/**
 * @openapi
 * @summary Retire tag
 * @tag Tags
 * @auth bearer
 * @pathParams PublicTagIdPathParams
 * @response 202:PublicTagMutation
 */
export const DELETE = withPublicApi<{ id: string }>(async (_request, { params }, ctx) => {
  const parsed = paramsSchema.safeParse(await params);
  if (!parsed.success) return validationError(parsed.error);
  return publicJson(await tags.requestTagMutation(ctx, parsed.data.id, 'delete'), { status: 202 });
});
