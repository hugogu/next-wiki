import { NextResponse, type NextRequest } from 'next/server';
import { translationRunCreateSchema, translationRunQuerySchema } from '@next-wiki/shared';
import { createApiContext } from '@/server/api/session';
import { formatZodError, parseQuery } from '@/server/api/validate';
import { apiError, internalError, mapDomainError } from '@/server/api/errors';
import { DomainError } from '@/server/errors';
import { withApiAudit, type RouteHandler } from '@/server/api/audit-wrapper';
import * as translations from '@/server/services/translations';

async function handleGET(request: NextRequest) {
  const parsed = parseQuery(translationRunQuerySchema, request.nextUrl.searchParams);
  if (!parsed.ok) return apiError('INVALID_TRANSLATION_INPUT', formatZodError(parsed.error), 400);
  try {
    return NextResponse.json(await translations.listRuns(await createApiContext(), parsed.data));
  } catch (error) {
    if (error instanceof DomainError) return mapDomainError(error);
    return internalError();
  }
}

async function handlePOST(request: NextRequest) {
  const parsed = translationRunCreateSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return apiError('INVALID_TRANSLATION_INPUT', formatZodError(parsed.error), 400);
  try {
    return NextResponse.json(await translations.createRun(await createApiContext(), parsed.data), {
      status: 202,
    });
  } catch (error) {
    if (error instanceof DomainError) return mapDomainError(error);
    return internalError();
  }
}

/**
 * @openapi
 * @summary List translation runs
 * @tag Translations
 * @auth bearer
 * @response TranslationRunList
 */
export const GET = withApiAudit(handleGET as unknown as RouteHandler);
/**
 * @openapi
 * @summary Start a translation run for one target language
 * @tag Translations
 * @auth bearer
 * @response 202:TranslationRunAccepted
 */
export const POST = withApiAudit(handlePOST as unknown as RouteHandler);
