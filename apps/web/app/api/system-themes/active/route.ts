import { NextResponse, type NextRequest } from 'next/server';
import { activateSystemThemeInputSchema } from '@next-wiki/shared';
import { createApiContext } from '@/server/api/session';
import { formatZodError, parseJson } from '@/server/api/validate';
import { apiError, internalError, mapDomainError } from '@/server/api/errors';
import { DomainError } from '@/server/errors';
import { activateSystemTheme } from '@/server/services/system-theme';

/**
 * @openapi
 * @summary Activate a system theme
 * @description Sets the active system theme. Pass null to clear the active selection. Requires manage_appearance.
 * @tag Appearance
 * @auth bearer
 * @body ActivateSystemThemeInput
 */
export async function PUT(request: NextRequest) {
  const parsed = parseJson(activateSystemThemeInputSchema, await request.json().catch(() => ({})));
  if (!parsed.ok) return apiError('BAD_REQUEST', formatZodError(parsed.error), 400);
  try {
    return NextResponse.json(await activateSystemTheme(await createApiContext(), parsed.data));
  } catch (error) {
    if (error instanceof DomainError) return mapDomainError(error);
    return internalError();
  }
}
