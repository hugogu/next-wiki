import { NextResponse, type NextRequest } from 'next/server';
import { translationRunRetrySchema } from '@next-wiki/shared';
import { createApiContext } from '@/server/api/session';
import { formatZodError, uuidSchema } from '@/server/api/validate';
import { apiError, internalError, mapDomainError } from '@/server/api/errors';
import { DomainError } from '@/server/errors';
import { withApiAudit, type RouteHandler } from '@/server/api/audit-wrapper';
import * as translations from '@/server/services/translations';

async function handlePOST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) return apiError('TRANSLATION_NOT_FOUND', 'Not found', 404);
  const parsed = translationRunRetrySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return apiError('INVALID_TRANSLATION_INPUT', formatZodError(parsed.error), 400);
  try {
    return NextResponse.json(await translations.retry(await createApiContext(), id, parsed.data), {
      status: 202,
    });
  } catch (error) {
    if (error instanceof DomainError) return mapDomainError(error);
    return internalError();
  }
}

/**
 * @openapi
 * @summary Create a retry/replacement successor translation run
 * @tag Translations
 * @auth bearer
 * @response 202:TranslationRunAccepted
 */
export const POST = withApiAudit(handlePOST as unknown as RouteHandler);
