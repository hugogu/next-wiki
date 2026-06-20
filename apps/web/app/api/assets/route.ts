import { NextResponse, type NextRequest } from 'next/server';
import { createApiContext } from '@/server/api/session';
import { apiError, mapDomainError, internalError } from '@/server/api/errors';
import { DomainError } from '@/server/errors';
import { withApiAudit, type RouteHandler } from '@/server/api/audit-wrapper';
import * as contentAssets from '@/server/services/content-assets';

/**
 * Upload an in-editor image.
 *
 * @openapi
 * @summary Upload an image
 * @description Uploads a raster image (PNG, JPEG, GIF, or WebP) for use in page content. Returns the asset id and its application-relative URL.
 * @tag Assets
 * @auth bearer
 * @response 200:AssetUploadResult
 */
async function handlePOST(request: NextRequest) {
  const ctx = await createApiContext();

  let bytes: Buffer;
  try {
    const formData = await request.formData();
    const file = formData.get('file');
    if (!file || typeof file === 'string') {
      return apiError('INVALID_IMAGE', 'A file field is required', 400);
    }
    bytes = Buffer.from(await file.arrayBuffer());
  } catch {
    return apiError('BAD_REQUEST', 'Invalid multipart form data', 400);
  }

  try {
    const result = await contentAssets.uploadImage(ctx, bytes);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof DomainError) return mapDomainError(error);
    return internalError();
  }
}

export const POST = withApiAudit(handlePOST as unknown as RouteHandler);
