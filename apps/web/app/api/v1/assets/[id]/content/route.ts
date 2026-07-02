import { NextResponse } from 'next/server';
import { z } from 'zod';
import { publicApiError, validationError } from '@/server/api/public-errors';
import { withPublicApi } from '../../../_shared/route';
import {
  UNAVAILABLE_IMAGE_BYTES,
  UNAVAILABLE_IMAGE_CONTENT_TYPE,
} from '@/server/content-store/unavailable-image';
import * as publicContent from '@/server/services/public-content';

const paramsSchema = z.object({ id: z.string().uuid() });

/**
 * Stream public asset content.
 *
 * @openapi
 * @summary Get public wiki asset content
 * @description Streams asset bytes if the caller may read the asset.
 * @tag Assets
 * @auth bearer
 * @pathParams PublicAssetIdPathParams
 * @response 200
 */
export const GET = withPublicApi<{ id: string }>(async (_request, { params }, ctx) => {
  const parsedParams = paramsSchema.safeParse(await params);
  if (!parsedParams.success) return validationError(parsedParams.error);

  const result = await publicContent.getAssetContent(ctx, parsedParams.data.id);
  if (result.kind === 'not_found') return publicApiError('NOT_FOUND', 'Asset not found', 404);
  if (result.kind === 'unavailable') {
    return new NextResponse(new Uint8Array(UNAVAILABLE_IMAGE_BYTES), {
      status: 200,
      headers: {
        'Content-Type': UNAVAILABLE_IMAGE_CONTENT_TYPE,
        'Cache-Control': 'no-store',
        'X-Content-Error': 'backend-unavailable',
      },
    });
  }
  if (result.kind === 'redirect') {
    return NextResponse.redirect(result.url, { status: 307, headers: { 'Cache-Control': 'private, max-age=120' } });
  }

  const headers: Record<string, string> = {
    'Content-Type': result.contentType,
    'Cache-Control': 'private, max-age=300',
    'X-Content-Type-Options': 'nosniff',
  };
  if (result.contentType === 'image/svg+xml') {
    headers['Content-Security-Policy'] = "default-src 'none'; style-src 'unsafe-inline'; sandbox";
    headers['Content-Disposition'] = 'inline';
  }
  return new NextResponse(new Uint8Array(result.bytes), { status: 200, headers });
});
