import { z } from 'zod';
import { publicJson, withPublicApi } from '../../../_shared/route';
import { publicApiError } from '@/server/api/public-errors';
import * as publicContent from '@/server/services/public-content';

const paramsSchema = z.object({ id: z.string().uuid() });

/**
 * Attach a file to a page, or list its current attachments.
 *
 * @openapi
 * @summary Attach a file to a page
 * @description Uploads a file (image, video, or document, per the wiki's configured limits) and attaches it to a page, separate from images embedded in the page body.
 * @tag Attachments
 * @auth bearer
 * @response 201:PublicAttachmentResource
 */
export const POST = withPublicApi<{ id: string }>(async (request, { params }, ctx) => {
  const parsedParams = paramsSchema.safeParse(await params);
  if (!parsedParams.success) {
    return publicApiError('VALIDATION_FAILED', 'Invalid page id', 422);
  }

  let bytes: Buffer;
  let fileName: string;
  let declaredContentType: string | undefined;
  try {
    const formData = await request.formData();
    const file = formData.get('file');
    if (!file || typeof file === 'string') {
      return publicApiError('VALIDATION_FAILED', 'A file field is required', 422);
    }
    bytes = Buffer.from(await file.arrayBuffer());
    fileName = file.name;
    // Only ever consulted as a fallback for types with no reliable magic
    // number (plain text/Markdown/CSV) — sniffed bytes always take
    // precedence for every other type (attachment-validation.ts).
    declaredContentType = file.type || undefined;
  } catch {
    return publicApiError('VALIDATION_FAILED', 'Invalid multipart form data', 422);
  }

  const attachment = await publicContent.attachToPage(ctx, parsedParams.data.id, bytes, fileName, declaredContentType);
  return publicJson(attachment, { status: 201 });
});

/**
 * List a page's current attachments.
 *
 * @openapi
 * @summary List a page's attachments
 * @description Lists the files currently attached to a page. Requires the same read access as reading the page's other content — no independent permission.
 * @tag Attachments
 * @auth bearer
 * @response PublicAttachmentList
 */
export const GET = withPublicApi<{ id: string }>(async (_request, { params }, ctx) => {
  const parsedParams = paramsSchema.safeParse(await params);
  if (!parsedParams.success) {
    return publicApiError('VALIDATION_FAILED', 'Invalid page id', 422);
  }

  const items = await publicContent.listAttachmentsForPage(ctx, parsedParams.data.id);
  return publicJson({ items });
});
