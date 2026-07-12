import { z } from 'zod';
import { publicJson, withPublicApi } from '../../_shared/route';
import { validationError } from '@/server/api/public-errors';
import * as tags from '@/server/services/tags';

const paramsSchema = z.object({ id: z.string().uuid() });

/**
 * @openapi
 * @summary Get tag mutation
 * @tag Tags
 * @auth bearer
 * @pathParams PublicTagIdPathParams
 * @response PublicTagMutation
 */
export const GET = withPublicApi<{ id: string }>(async (_request, { params }, ctx) => {
  const parsed = paramsSchema.safeParse(await params);
  if (!parsed.success) return validationError(parsed.error);
  return publicJson(await tags.getTagMutation(ctx, parsed.data.id));
});
