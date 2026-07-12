import { NextResponse } from 'next/server';
import { createApiContext } from '@/server/api/session';
import { internalError, mapDomainError } from '@/server/api/errors';
import { DomainError } from '@/server/errors';
import { withApiAudit, type RouteHandler } from '@/server/api/audit-wrapper';
import * as translations from '@/server/services/translations';

async function handleGET() {
  try {
    return NextResponse.json(await translations.getStats(await createApiContext()));
  } catch (error) {
    if (error instanceof DomainError) return mapDomainError(error);
    return internalError();
  }
}

/**
 * @openapi
 * @summary Per-language translation coverage stats
 * @tag Translations
 * @auth bearer
 * @response TranslationStats
 */
export const GET = withApiAudit(handleGET as unknown as RouteHandler);
