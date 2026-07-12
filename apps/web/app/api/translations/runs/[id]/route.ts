import { NextResponse, type NextRequest } from 'next/server';
import { createApiContext } from '@/server/api/session';
import { uuidSchema } from '@/server/api/validate';
import { apiError, internalError, mapDomainError } from '@/server/api/errors';
import { DomainError } from '@/server/errors';
import { withApiAudit, type RouteHandler } from '@/server/api/audit-wrapper';
import * as translations from '@/server/services/translations';

async function handleGET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) return apiError('TRANSLATION_NOT_FOUND', 'Not found', 404);
  try {
    return NextResponse.json(await translations.getRun(await createApiContext(), id));
  } catch (error) {
    if (error instanceof DomainError) return mapDomainError(error);
    return internalError();
  }
}

/**
 * @openapi
 * @summary Get a translation run
 * @tag Translations
 * @auth bearer
 * @response TranslationRunView
 */
export const GET = withApiAudit(handleGET as unknown as RouteHandler);
