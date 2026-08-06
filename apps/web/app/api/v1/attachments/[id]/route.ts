import { z } from 'zod';
import { validationError } from '@/server/api/public-errors';
import { withPublicApi } from '../../_shared/route';
import * as publicContent from '@/server/services/public-content';

const paramsSchema = z.object({ id: z.string().uuid() });

/**
 * Remove an attachment from its page.
 *
 * @openapi
 * @summary Remove an attachment
 * @description Removes (soft-deletes) an attachment. Requires the same edit permission as the owning page — no independent scope, unlike attaching.
 * @tag Attachments
 * @auth bearer
 * @response 204
 */
export const DELETE = withPublicApi<{ id: string }>(async (_request, { params }, ctx) => {
  const parsedParams = paramsSchema.safeParse(await params);
  if (!parsedParams.success) return validationError(parsedParams.error);

  await publicContent.removeAttachment(ctx, parsedParams.data.id);
  return new Response(null, { status: 204 });
});
