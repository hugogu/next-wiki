import { NextResponse } from 'next/server';
import { createApiContext } from '@/server/api/session';
import { handleApiError } from '@/server/api/errors';
import { withApiAudit, type RouteHandler } from '@/server/api/audit-wrapper';
import * as translations from '@/server/services/translations';

async function handleGET() {
  try {
    return NextResponse.json(await translations.getStats(await createApiContext()));
  } catch (error) {
    return handleApiError(error);
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
