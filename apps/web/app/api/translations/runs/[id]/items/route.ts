import { NextResponse, type NextRequest } from 'next/server';
import { translationRunItemQuerySchema } from '@next-wiki/shared';
import { createApiContext } from '@/server/api/session';
import { formatZodError, parseQuery, uuidSchema } from '@/server/api/validate';
import { apiError, internalError, mapDomainError } from '@/server/api/errors';
import { DomainError } from '@/server/errors';
import { withApiAudit, type RouteHandler } from '@/server/api/audit-wrapper';
import * as translations from '@/server/services/translations';

async function handleGET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) return apiError('TRANSLATION_NOT_FOUND', 'Not found', 404);
  const parsed = parseQuery(translationRunItemQuerySchema, request.nextUrl.searchParams);
  if (!parsed.ok) return apiError('INVALID_TRANSLATION_INPUT', formatZodError(parsed.error), 400);
  try {
    return NextResponse.json(
      await translations.listItems(await createApiContext(), id, parsed.data),
    );
  } catch (error) {
    if (error instanceof DomainError) return mapDomainError(error);
    return internalError();
  }
}

/**
 * @openapi
 * @summary List per-page items of a translation run
 * @tag Translations
 * @auth bearer
 * @response TranslationRunItemList
 */
export const GET = withApiAudit(handleGET as unknown as RouteHandler);
