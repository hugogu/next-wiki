import { NextResponse, type NextRequest } from 'next/server';
import { createApiContext } from '@/server/api/session';
import { uuidSchema } from '@/server/api/validate';
import { apiError, internalError, mapDomainError } from '@/server/api/errors';
import { DomainError } from '@/server/errors';
import { withApiAudit, type RouteHandler } from '@/server/api/audit-wrapper';
import * as translations from '@/server/services/translations';

async function handlePOST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) return apiError('TRANSLATION_NOT_FOUND', 'Not found', 404);
  try {
    return NextResponse.json(await translations.requestPause(await createApiContext(), id), {
      status: 202,
    });
  } catch (error) {
    if (error instanceof DomainError) return mapDomainError(error);
    return internalError();
  }
}

/**
 * @openapi
 * @summary Pause an active translation run
 * @tag Translations
 * @auth bearer
 * @response 202:TranslationRunView
 */
export const POST = withApiAudit(handlePOST as unknown as RouteHandler);
