import { NextResponse } from 'next/server';
import { z } from 'zod';
import { publicApiError, validationError } from '@/server/api/public-errors';
import { withPublicApi } from '../../../_shared/route';
import { isInlineSafeType } from '@/server/content-store/attachment-validation';
import * as publicContent from '@/server/services/public-content';

const paramsSchema = z.object({ id: z.string().uuid() });

/** RFC 6266/5987-compliant `Content-Disposition` filename, safely encoding a
 * caller-supplied name (FR-011b) so it is never interpreted as response-
 * header syntax. */
function contentDispositionHeader(disposition: 'inline' | 'attachment', fileName: string): string {
  const asciiFallback = fileName.replace(/[^\x20-\x7e]/g, '_').replace(/"/g, "'");
  return `${disposition}; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

/**
 * Download an attachment's content.
 *
 * @openapi
 * @summary Download an attachment
 * @description Streams an attachment's bytes if the caller may read its page. Browser-safe types (images, PDF) are served inline; every other type forces a download — never administrator-configurable.
 * @tag Attachments
 * @auth bearer
 * @response 200
 */
export const GET = withPublicApi<{ id: string }>(async (_request, { params }, ctx) => {
  const parsedParams = paramsSchema.safeParse(await params);
  if (!parsedParams.success) return validationError(parsedParams.error);

  const result = await publicContent.getAttachmentContent(ctx, parsedParams.data.id);
  if (result.kind === 'not_found') return publicApiError('NOT_FOUND', 'Attachment not found', 404);
  if (result.kind === 'unavailable') {
    return publicApiError('INTERNAL_ERROR', 'Attachment storage is temporarily unavailable', 503);
  }

  const disposition = isInlineSafeType(result.contentType) ? 'inline' : 'attachment';
  return new NextResponse(new Uint8Array(result.bytes), {
    status: 200,
    headers: {
      'Content-Type': result.contentType,
      'Content-Disposition': contentDispositionHeader(disposition, result.fileName),
      'Cache-Control': 'private, max-age=300',
      'X-Content-Type-Options': 'nosniff',
    },
  });
});
