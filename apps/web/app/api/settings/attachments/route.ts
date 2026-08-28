import { NextResponse, type NextRequest } from 'next/server';
import { attachmentSettingsUpsertSchema } from '@next-wiki/shared';
import { createApiContext } from '@/server/api/session';
import { apiError, handleApiError } from '@/server/api/errors';
import { formatZodError, parseJson } from '@/server/api/validate';
import { getAttachmentSettings, updateAttachmentSettings } from '@/server/services/attachment-settings';
import { assertCanManageStorage } from '@/server/services/storage-config';

/** @openapi @summary Get attachment settings @tag Attachments Admin @auth bearer */
export async function GET() {
  try {
    assertCanManageStorage(await createApiContext());
    return NextResponse.json(await getAttachmentSettings());
  } catch (error) {
    return handleApiError(error);
  }
}

/** @openapi @summary Update attachment settings @tag Attachments Admin @auth bearer */
export async function PATCH(request: NextRequest) {
  const parsed = parseJson(attachmentSettingsUpsertSchema, await request.json().catch(() => ({})));
  if (!parsed.ok) return apiError('BAD_REQUEST', formatZodError(parsed.error), 400);
  try {
    return NextResponse.json(await updateAttachmentSettings(await createApiContext(), parsed.data));
  } catch (error) {
    return handleApiError(error);
  }
}
