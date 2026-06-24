import { NextResponse, type NextRequest } from 'next/server';
import { updateUserAppearanceInputSchema } from '@next-wiki/shared';
import { createApiContext } from '@/server/api/session';
import { formatZodError, parseJson } from '@/server/api/validate';
import { apiError, internalError, mapDomainError } from '@/server/api/errors';
import { DomainError } from '@/server/errors';
import { getUserAppearance, resetUserAppearance, updateUserAppearance } from '@/server/services/user-appearance';

/**
 * @openapi
 * @summary Get the caller's reading-theme tokens
 * @description Returns the per-user reading-theme tokens (or defaults if the user has not customized). Authenticated.
 * @tag Appearance
 * @auth bearer
 */
export async function GET() {
  try {
    return NextResponse.json(await getUserAppearance(await createApiContext()));
  } catch (error) {
    if (error instanceof DomainError) return mapDomainError(error);
    return internalError();
  }
}

/**
 * @openapi
 * @summary Update the caller's reading-theme tokens
 * @description Replaces the per-user reading-theme tokens. Authenticated.
 * @tag Appearance
 * @auth bearer
 * @body UpdateUserAppearanceInput
 */
export async function PUT(request: NextRequest) {
  const parsed = parseJson(updateUserAppearanceInputSchema, await request.json().catch(() => ({})));
  if (!parsed.ok) return apiError('BAD_REQUEST', formatZodError(parsed.error), 400);
  try {
    return NextResponse.json(await updateUserAppearance(await createApiContext(), parsed.data));
  } catch (error) {
    if (error instanceof DomainError) return mapDomainError(error);
    return internalError();
  }
}

/**
 * @openapi
 * @summary Reset the caller's reading-theme tokens to defaults
 * @description Deletes the per-user row; subsequent reads return the static defaults. Authenticated.
 * @tag Appearance
 * @auth bearer
 */
export async function DELETE() {
  try {
    return NextResponse.json(await resetUserAppearance(await createApiContext()));
  } catch (error) {
    if (error instanceof DomainError) return mapDomainError(error);
    return internalError();
  }
}
