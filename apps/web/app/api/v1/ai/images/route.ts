import { aiImageInputSchema } from '@next-wiki/shared';
import { parsePublicJson, publicJson, withPublicApi } from '../../_shared/route';
import { submitPublicImageGeneration } from '@/server/services/public-ai-images';

/**
 * @openapi
 * @summary Submit an asynchronous private Wiki image generation request
 * @tag AI images
 * @auth bearer
 * @body PublicImageGenerationInput
 * @response 202:PublicImageGeneration
 */
export const POST = withPublicApi(async (request, _context, ctx) => {
  const parsed = await parsePublicJson(request, aiImageInputSchema);
  if (!parsed.ok) return parsed.response;
  return publicJson(await submitPublicImageGeneration(ctx, parsed.data), { status: 202 });
});
