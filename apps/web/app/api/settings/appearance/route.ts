import { NextResponse, type NextRequest } from 'next/server';
import { updateSystemThemeInputSchema } from '@next-wiki/shared';
import { createApiContext } from '@/server/api/session';
import { formatZodError, parseJson } from '@/server/api/validate';
import { apiError, internalError, mapDomainError } from '@/server/api/errors';
import { DomainError } from '@/server/errors';
import { getSystemThemeView, updateSystemThemeCss } from '@/server/services/system-theme';

/**
 * @openapi
 * @summary Get system theme CSS
 * @description Returns the admin-authored system theme CSS (or empty string when unset). Public-readable.
 * @tag Appearance
 */
export async function GET() {
  try {
    return NextResponse.json(await getSystemThemeView());
  } catch (error) {
    if (error instanceof DomainError) return mapDomainError(error);
    return internalError();
  }
}

/**
 * @openapi
 * @summary Update system theme CSS
 * @description Replaces the admin-authored CSS. Sanitized on save. Requires manage_appearance.
 * @tag Appearance
 * @auth bearer
 * @body UpdateSystemThemeInput
 */
export async function PUT(request: NextRequest) {
  const parsed = parseJson(updateSystemThemeInputSchema, await request.json().catch(() => ({})));
  if (!parsed.ok) return apiError('BAD_REQUEST', formatZodError(parsed.error), 400);
  try {
    return NextResponse.json(await updateSystemThemeCss(await createApiContext(), parsed.data));
  } catch (error) {
    if (error instanceof DomainError) return mapDomainError(error);
    return internalError();
  }
}
