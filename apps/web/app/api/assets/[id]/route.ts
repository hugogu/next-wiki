import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createApiContext } from '@/server/api/session';
import { apiError, internalError } from '@/server/api/errors';
import { withApiAudit, type RouteHandler } from '@/server/api/audit-wrapper';
import * as contentAssets from '@/server/services/content-assets';
import {
  UNAVAILABLE_IMAGE_BYTES,
  UNAVAILABLE_IMAGE_CONTENT_TYPE,
} from '@/server/content-store/unavailable-image';

const idSchema = z.string().uuid();

async function handleGET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await createApiContext();
  const { id } = await params;
  if (!idSchema.safeParse(id).success) {
    return apiError('NOT_FOUND', 'Image not found', 404);
  }

  try {
    const result = await contentAssets.getServableImage(ctx, id);

    if (result.kind === 'not_found') {
      return apiError('NOT_FOUND', 'Image not found', 404);
    }

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
      return NextResponse.redirect(result.url, {
        status: 307,
        // Cache the redirect itself briefly (well under the presigned URL's
        // lifetime) so repeated loads — page revisits and editor re-renders —
        // reuse the same S3 URL instead of re-fetching on every request.
        headers: { 'Cache-Control': 'private, max-age=120' },
      });
    }

    const headers: Record<string, string> = {
      'Content-Type': result.contentType,
      // Private: honors page permission, so it must not be shared-cached.
      'Cache-Control': 'private, max-age=300',
      // Never let the browser re-sniff bytes into a more dangerous type.
      'X-Content-Type-Options': 'nosniff',
    };
    if (result.contentType === 'image/svg+xml') {
      // SVG bytes are sanitized at write time; this is defense in depth for
      // direct navigation to the asset URL. `sandbox` with no allow-* tokens
      // disables scripts, plugins, and same-origin privileges; `default-src
      // 'none'` blocks any subresource load (the SVG may still use inline
      // styles). `Content-Disposition: inline` keeps legitimate <img> rendering
      // working without exposing a scriptable document context.
      headers['Content-Security-Policy'] = "default-src 'none'; style-src 'unsafe-inline'; sandbox";
      headers['Content-Disposition'] = 'inline';
    }
    return new NextResponse(new Uint8Array(result.bytes), { status: 200, headers });
  } catch {
    return internalError();
  }
}

/**
 * Serve an image's bytes, enforcing page-equivalent read permission.
 *
 * @openapi
 * @summary Get an image
 * @description Streams the bytes of an image asset. Requires read access to a page that references it; unreadable or missing assets return 404 with no existence leak.
 * @tag Assets
 * @response 200
 */
export const GET = withApiAudit(handleGET as unknown as RouteHandler);
