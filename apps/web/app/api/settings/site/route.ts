import { NextResponse, type NextRequest } from 'next/server';
import { updateSiteSettingsInputSchema } from '@next-wiki/shared';
import { createApiContext } from '@/server/api/session';
import { formatZodError, parseJson } from '@/server/api/validate';
import { apiError, internalError, mapDomainError } from '@/server/api/errors';
import { DomainError } from '@/server/errors';
import { getSiteView, updateSiteSettings } from '@/server/services/site-settings';

/**
 * @openapi
 * @summary Get site information
 * @description Returns the public site identity and footer settings.
 * @tag Appearance
 */
export async function GET() {
  try {
    return NextResponse.json(await getSiteView());
  } catch (error) {
    if (error instanceof DomainError) return mapDomainError(error);
    return internalError();
  }
}

/**
 * @openapi
 * @summary Update site information
 * @description Updates the site name and footer fields. Requires the manage_appearance capability.
 * @tag Appearance
 * @auth bearer
 * @body UpdateSiteSettingsInput
 */
export async function PUT(request: NextRequest) {
  const parsed = parseJson(updateSiteSettingsInputSchema, await request.json().catch(() => ({})));
  if (!parsed.ok) return apiError('BAD_REQUEST', formatZodError(parsed.error), 400);
  try {
    return NextResponse.json(await updateSiteSettings(await createApiContext(), parsed.data));
  } catch (error) {
    if (error instanceof DomainError) return mapDomainError(error);
    return internalError();
  }
}
