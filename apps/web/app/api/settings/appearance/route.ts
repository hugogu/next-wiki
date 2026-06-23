import { NextResponse, type NextRequest } from 'next/server';
import { updateAppearanceSettingsInputSchema } from '@next-wiki/shared';
import { createApiContext } from '@/server/api/session';
import { formatZodError, parseJson } from '@/server/api/validate';
import { apiError, internalError, mapDomainError } from '@/server/api/errors';
import { DomainError } from '@/server/errors';
import { getAppearanceView, updateAppearanceSettings } from '@/server/services/appearance-settings';

/**
 * @openapi
 * @summary Get system appearance settings
 * @description Returns the active appearance tokens (or static defaults). Public-readable; values carry no secrets.
 * @tag Appearance
 */
export async function GET() {
  try {
    return NextResponse.json(await getAppearanceView());
  } catch (error) {
    if (error instanceof DomainError) return mapDomainError(error);
    return internalError();
  }
}

/**
 * @openapi
 * @summary Update system appearance settings
 * @description Replaces the site-wide appearance tokens. Requires the manage_appearance capability.
 * @tag Appearance
 * @auth bearer
 * @body UpdateAppearanceSettingsInput
 */
export async function PUT(request: NextRequest) {
  const parsed = parseJson(updateAppearanceSettingsInputSchema, await request.json().catch(() => ({})));
  if (!parsed.ok) return apiError('BAD_REQUEST', formatZodError(parsed.error), 400);
  try {
    return NextResponse.json(await updateAppearanceSettings(await createApiContext(), parsed.data));
  } catch (error) {
    if (error instanceof DomainError) return mapDomainError(error);
    return internalError();
  }
}
