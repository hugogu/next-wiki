import { z } from 'zod';
import { publicApiError, validationError } from '@/server/api/public-errors';
import { publicJson, withPublicApi } from '../../_shared/route';
import * as publicContent from '@/server/services/public-content';

const paramsSchema = z.object({ id: z.string().uuid() });

/**
 * Get public asset metadata.
 *
 * @openapi
 * @summary Get public wiki asset metadata
 * @description Returns asset metadata if the caller may read the asset.
 * @tag Public Wiki Content
 * @auth bearer
 * @response PublicAssetResource
 */
export const GET = withPublicApi<{ id: string }>(async (_request, { params }, ctx) => {
  const parsedParams = paramsSchema.safeParse(await params);
  if (!parsedParams.success) return validationError(parsedParams.error);

  const asset = await publicContent.getAsset(ctx, parsedParams.data.id);
  if (!asset) return publicApiError('NOT_FOUND', 'Asset not found', 404);
  return publicJson(asset);
});
