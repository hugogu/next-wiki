import { NextResponse, type NextRequest } from 'next/server';
import { localeCodeSchema, translationLanguageUpdateSchema } from '@next-wiki/shared';
import { createApiContext } from '@/server/api/session';
import { formatZodError } from '@/server/api/validate';
import { apiError, internalError, mapDomainError } from '@/server/api/errors';
import { DomainError } from '@/server/errors';
import { withApiAudit, type RouteHandler } from '@/server/api/audit-wrapper';
import * as config from '@/server/services/translation-config';

function parseCode(raw: string): string | null {
  const parsed = localeCodeSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

async function handlePATCH(request: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const code = parseCode((await params).code);
  if (!code) return apiError('TRANSLATION_NOT_FOUND', 'Not found', 404);
  const parsed = translationLanguageUpdateSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return apiError('INVALID_TRANSLATION_INPUT', formatZodError(parsed.error), 400);
  try {
    return NextResponse.json(await config.updateLanguage(await createApiContext(), code, parsed.data));
  } catch (error) {
    if (error instanceof DomainError) return mapDomainError(error);
    return internalError();
  }
}

async function handleDELETE(_request: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const code = parseCode((await params).code);
  if (!code) return apiError('TRANSLATION_NOT_FOUND', 'Not found', 404);
  try {
    await config.retireLanguage(await createApiContext(), code);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    if (error instanceof DomainError) return mapDomainError(error);
    return internalError();
  }
}

/**
 * @openapi
 * @summary Update a translation target language
 * @tag Translations
 * @auth bearer
 * @response TranslationLanguageView
 */
export const PATCH = withApiAudit(handlePATCH as unknown as RouteHandler);
/**
 * @openapi
 * @summary Retire a translation target language
 * @tag Translations
 * @auth bearer
 */
export const DELETE = withApiAudit(handleDELETE as unknown as RouteHandler);
