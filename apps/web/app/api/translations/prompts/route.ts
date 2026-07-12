import { NextResponse, type NextRequest } from 'next/server';
import { translationPromptCreateSchema } from '@next-wiki/shared';
import { createApiContext } from '@/server/api/session';
import { formatZodError } from '@/server/api/validate';
import { apiError, internalError, mapDomainError } from '@/server/api/errors';
import { DomainError } from '@/server/errors';
import { withApiAudit, type RouteHandler } from '@/server/api/audit-wrapper';
import * as config from '@/server/services/translation-config';

async function handleGET() {
  try {
    return NextResponse.json({ items: await config.listPrompts(await createApiContext()) });
  } catch (error) {
    if (error instanceof DomainError) return mapDomainError(error);
    return internalError();
  }
}

async function handlePOST(request: NextRequest) {
  const parsed = translationPromptCreateSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return apiError('INVALID_TRANSLATION_INPUT', formatZodError(parsed.error), 400);
  try {
    return NextResponse.json(await config.createPrompt(await createApiContext(), parsed.data), {
      status: 201,
    });
  } catch (error) {
    if (error instanceof DomainError) return mapDomainError(error);
    return internalError();
  }
}

/**
 * @openapi
 * @summary List translation prompt styles
 * @tag Translations
 * @auth bearer
 * @response TranslationPromptTemplateList
 */
export const GET = withApiAudit(handleGET as unknown as RouteHandler);
/**
 * @openapi
 * @summary Create a translation prompt style
 * @tag Translations
 * @auth bearer
 * @response 201:TranslationPromptDetail
 */
export const POST = withApiAudit(handlePOST as unknown as RouteHandler);
