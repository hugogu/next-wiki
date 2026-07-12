import { NextResponse, type NextRequest } from 'next/server';
import { translationDocumentQuerySchema } from '@next-wiki/shared';
import { createApiContext } from '@/server/api/session';
import { formatZodError, parseQuery } from '@/server/api/validate';
import { apiError, internalError, mapDomainError } from '@/server/api/errors';
import { DomainError } from '@/server/errors';
import { withApiAudit, type RouteHandler } from '@/server/api/audit-wrapper';
import * as translations from '@/server/services/translations';

async function handleGET(request: NextRequest) {
  const parsed = parseQuery(translationDocumentQuerySchema, request.nextUrl.searchParams);
  if (!parsed.ok) return apiError('INVALID_TRANSLATION_INPUT', formatZodError(parsed.error), 400);
  try {
    return NextResponse.json(await translations.listDocuments(await createApiContext(), parsed.data));
  } catch (error) {
    if (error instanceof DomainError) return mapDomainError(error);
    return internalError();
  }
}

/**
 * @openapi
 * @summary List translated documents and their freshness
 * @tag Translations
 * @auth bearer
 * @response TranslationDocumentList
 */
export const GET = withApiAudit(handleGET as unknown as RouteHandler);
