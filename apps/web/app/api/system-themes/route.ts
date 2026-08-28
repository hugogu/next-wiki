import { NextResponse, type NextRequest } from 'next/server';
import { createSystemThemeInputSchema } from '@next-wiki/shared';
import { createApiContext } from '@/server/api/session';
import { formatZodError, parseJson } from '@/server/api/validate';
import { apiError, handleApiError } from '@/server/api/errors';
import { createSystemTheme, listSystemThemes } from '@/server/services/system-theme';

/**
 * @openapi
 * @summary List system themes
 * @description Lists all system themes (built-ins + custom) and the active selection for authenticated users. Mutations require manage_appearance.
 * @tag Appearance
 * @auth bearer
 */
export async function GET() {
  try {
    return NextResponse.json(await listSystemThemes(await createApiContext()));
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * @openapi
 * @summary Create a system theme
 * @description Copies an existing theme (typically a built-in) into a new editable custom row. Requires manage_appearance.
 * @tag Appearance
 * @auth bearer
 * @body CreateSystemThemeInput
 */
export async function POST(request: NextRequest) {
  const parsed = parseJson(createSystemThemeInputSchema, await request.json().catch(() => ({})));
  if (!parsed.ok) return apiError('BAD_REQUEST', formatZodError(parsed.error), 400);
  try {
    return NextResponse.json(await createSystemTheme(await createApiContext(), parsed.data), {
      status: 201,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
