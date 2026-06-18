import { NextResponse, type NextRequest } from 'next/server';
import { updatePreferencesInputSchema } from '@next-wiki/shared';
import { createApiContext } from '@/server/api/session';
import { parseJson, formatZodError } from '@/server/api/validate';
import { apiError, mapDomainError, internalError } from '@/server/api/errors';
import { DomainError } from '@/server/errors';
import { withApiAudit, type RouteHandler } from '@/server/api/audit-wrapper';
import * as userCenterService from '@/server/services/user-center';

/**
 * Update preferences.
 *
 * @openapi
 * @summary Update preferences
 * @description Updates the signed-in user's theme and/or locale preference.
 * @tag User
 * @auth bearer
 * @body UpdatePreferencesInput
 * @response PreferencesView
 */
async function handlePATCH(request: NextRequest) {
  const ctx = await createApiContext();
  const body = await request.json().catch(() => ({}));
  const parsed = parseJson(updatePreferencesInputSchema, body);
  if (!parsed.ok) {
    return apiError('BAD_REQUEST', formatZodError(parsed.error), 400);
  }

  try {
    const result = await userCenterService.updatePreferences(ctx, parsed.data);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof DomainError) return mapDomainError(error);
    return internalError();
  }
}

export const PATCH = withApiAudit(handlePATCH as unknown as RouteHandler);
