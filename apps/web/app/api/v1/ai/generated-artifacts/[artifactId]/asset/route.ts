import { aiArtifactPromotionSchema } from '@next-wiki/shared';
import { z } from 'zod';
import { publicApiError } from '@/server/api/public-errors';
import { promotePublicGeneratedArtifact } from '@/server/services/public-ai-images';
import { parsePublicJson, publicJson, withPublicApi } from '../../../../_shared/route';

const paramsSchema = z.object({ artifactId: z.string().uuid() });

/**
 * @openapi
 * @summary Promote a generated image to a normal Wiki asset
 * @tag AI images
 * @auth bearer
 * @pathParams PublicGeneratedArtifactIdPathParams
 * @body PublicGeneratedArtifactPromotionInput
 * @response 200:PublicAssetResource
 */
export const POST = withPublicApi<{ artifactId: string }>(async (request, { params }, ctx) => {
  const parsedParams = paramsSchema.safeParse(await params);
  if (!parsedParams.success) return publicApiError('NOT_FOUND', 'Generated artifact not found', 404);
  const parsedBody = await parsePublicJson(request, aiArtifactPromotionSchema);
  if (!parsedBody.ok) return parsedBody.response;
  return publicJson(await promotePublicGeneratedArtifact(ctx, parsedParams.data.artifactId, parsedBody.data.pageId));
});
