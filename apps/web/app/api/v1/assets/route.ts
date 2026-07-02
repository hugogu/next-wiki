import { publicJson, withPublicApi } from '../_shared/route';
import { publicApiError } from '@/server/api/public-errors';
import * as publicContent from '@/server/services/public-content';

/**
 * Upload a supported asset for Markdown insertion.
 *
 * @openapi
 * @summary Upload public wiki asset
 * @description Uploads an image asset and returns a Markdown-ready public reference.
 * @tag Assets
 * @auth bearer
 * @response 201:PublicAssetUploadResult
 */
export const POST = withPublicApi(async (request, _context, ctx) => {
  let bytes: Buffer;
  try {
    const formData = await request.formData();
    const file = formData.get('file');
    if (!file || typeof file === 'string') {
      return publicApiError('VALIDATION_FAILED', 'A file field is required', 422);
    }
    bytes = Buffer.from(await file.arrayBuffer());
  } catch {
    return publicApiError('VALIDATION_FAILED', 'Invalid multipart form data', 422);
  }

  return publicJson(await publicContent.uploadAsset(ctx, bytes), { status: 201 });
});
