import { z } from 'zod';
import { publicApiError } from '@/server/api/public-errors';
import { discardPublicGeneratedArtifact, getPublicGeneratedArtifact } from '@/server/services/public-ai-images';
import { withPublicApi } from '../../../_shared/route';

const paramsSchema = z.object({ artifactId: z.string().uuid() });

/**
 * @openapi
 * @summary Download a private generated image preview
 * @tag AI images
 * @auth bearer
 * @pathParams PublicGeneratedArtifactIdPathParams
 * @response 200
 */
export const GET = withPublicApi<{ artifactId: string }>(async (_request, { params }, ctx) => {
  const parsed = paramsSchema.safeParse(await params);
  if (!parsed.success) return publicApiError('NOT_FOUND', 'Generated artifact not found', 404);
  const artifact = await getPublicGeneratedArtifact(ctx, parsed.data.artifactId);
  return new Response(artifact.bytes, {
    headers: {
      'Content-Type': artifact.contentType,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
});

/**
 * @openapi
 * @summary Discard a private generated image preview
 * @tag AI images
 * @auth bearer
 * @pathParams PublicGeneratedArtifactIdPathParams
 * @response 204
 */
export const DELETE = withPublicApi<{ artifactId: string }>(async (_request, { params }, ctx) => {
  const parsed = paramsSchema.safeParse(await params);
  if (!parsed.success) return publicApiError('NOT_FOUND', 'Generated artifact not found', 404);
  await discardPublicGeneratedArtifact(ctx, parsed.data.artifactId);
  return new Response(null, { status: 204, headers: { 'Cache-Control': 'private, no-store' } });
});
