import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createApiContext } from '@/server/api/session';
import { apiError, internalError } from '@/server/api/errors';
import * as contentAssets from '@/server/services/content-assets';

const idSchema = z.string().uuid();

/**
 * Serve a raw entry's immutable original bytes. Admin-only via the asset's raw
 * page reference. `?download=1` forces an attachment disposition; otherwise the
 * bytes are served inline (so a PDF/image can render in a viewer). Never cached
 * publicly — raw content is restricted.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!idSchema.safeParse(id).success) return apiError('NOT_FOUND', 'Asset not found', 404);
  try {
    const ctx = await createApiContext();
    const result = await contentAssets.getServableRawAsset(ctx, id);
    if (result.kind === 'not_found') return apiError('NOT_FOUND', 'Asset not found', 404);
    if (result.kind === 'unavailable') {
      return apiError('STORAGE_UNAVAILABLE', 'The content backend is temporarily unavailable', 503);
    }
    const download = request.nextUrl.searchParams.get('download') === '1';
    return new NextResponse(new Uint8Array(result.bytes), {
      status: 200,
      headers: {
        'Content-Type': result.contentType,
        'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="raw-${id}"`,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch {
    return internalError();
  }
}
