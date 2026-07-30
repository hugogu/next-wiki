import { NextResponse, type NextRequest } from 'next/server';
import { translationSettingsUpdateSchema } from '@next-wiki/shared';
import { createApiContext } from '@/server/api/session';
import { formatZodError, parseJson } from '@/server/api/validate';
import { apiError, internalError, mapDomainError } from '@/server/api/errors';
import { DomainError } from '@/server/errors';
import { withApiAudit, type RouteHandler } from '@/server/api/audit-wrapper';
import * as config from '@/server/services/translation-config';

async function handleGET() {
  try {
    return NextResponse.json(await config.readSettings(await createApiContext()));
  } catch (error) {
    if (error instanceof DomainError) return mapDomainError(error);
    return internalError();
  }
}

async function handlePATCH(request: NextRequest) {
  const parsed = parseJson(
    translationSettingsUpdateSchema,
    await request.json().catch(() => ({})),
  );
  if (!parsed.ok) return apiError('INVALID_TRANSLATION_INPUT', formatZodError(parsed.error), 400);
  try {
    return NextResponse.json(await config.updateSettings(await createApiContext(), parsed.data));
  } catch (error) {
    if (error instanceof DomainError) return mapDomainError(error);
    return internalError();
  }
}

/**
 * @openapi
 * @summary Get translation runtime settings
 * @tag Translations
 * @auth bearer
 * @response TranslationSettingsView
 */
export const GET = withApiAudit(handleGET as unknown as RouteHandler);
/**
 * @openapi
 * @summary Update translation runtime settings
 * @tag Translations
 * @auth bearer
 * @response TranslationSettingsView
 */
export const PATCH = withApiAudit(handlePATCH as unknown as RouteHandler);
