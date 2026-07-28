import { z } from 'zod';
import { publicApiError } from '@/server/api/public-errors';
import { getPublicImageGeneration, cancelPublicImageGeneration } from '@/server/services/public-ai-images';
import { publicJson, withPublicApi } from '../../../_shared/route';

const paramsSchema = z.object({ actionId: z.string().uuid() });

/**
 * @openapi
 * @summary Get a private image generation status
 * @tag AI images
 * @auth bearer
 * @pathParams PublicImageActionIdPathParams
 * @response 200:PublicImageGeneration
 */
export const GET = withPublicApi<{ actionId: string }>(async (_request, { params }, ctx) => {
  const parsed = paramsSchema.safeParse(await params);
  if (!parsed.success) return publicApiError('NOT_FOUND', 'Image generation not found', 404);
  return publicJson(await getPublicImageGeneration(ctx, parsed.data.actionId));
});

/**
 * @openapi
 * @summary Cancel a private image generation request
 * @tag AI images
 * @auth bearer
 * @pathParams PublicImageActionIdPathParams
 * @response 204
 */
export const DELETE = withPublicApi<{ actionId: string }>(async (_request, { params }, ctx) => {
  const parsed = paramsSchema.safeParse(await params);
  if (!parsed.success) return publicApiError('NOT_FOUND', 'Image generation not found', 404);
  await cancelPublicImageGeneration(ctx, parsed.data.actionId);
  return new Response(null, { status: 204, headers: { 'Cache-Control': 'private, no-store' } });
});
