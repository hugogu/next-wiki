import { NextResponse } from 'next/server';
import { updateProfileInputSchema } from '@next-wiki/shared';
import { createApiContext } from '@/server/api/session';
import { parseJson, formatZodError } from '@/server/api/validate';
import { apiError, mapDomainError, internalError } from '@/server/api/errors';
import { DomainError } from '@/server/errors';
import * as userCenterService from '@/server/services/user-center';

/**
 * Update profile.
 *
 * @openapi
 * @summary Update profile
 * @description Updates the signed-in user's display name.
 * @tag User
 * @auth bearer
 * @body UpdateProfileInput
 * @response ProfileViewSchema
 */
export async function PATCH(request: Request) {
  const ctx = await createApiContext();
  const body = await request.json().catch(() => ({}));
  const parsed = parseJson(updateProfileInputSchema, body);
  if (!parsed.ok) {
    return apiError('BAD_REQUEST', formatZodError(parsed.error), 400);
  }

  try {
    const result = await userCenterService.updateProfile(ctx, parsed.data);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof DomainError) return mapDomainError(error);
    return internalError();
  }
}
