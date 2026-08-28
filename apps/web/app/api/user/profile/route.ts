import { NextResponse, type NextRequest } from 'next/server';
import { updateProfileInputSchema } from '@next-wiki/shared';
import { createApiContext } from '@/server/api/session';
import { parseJson, formatZodError } from '@/server/api/validate';
import { apiError, handleApiError } from '@/server/api/errors';
import { withApiAudit, type RouteHandler } from '@/server/api/audit-wrapper';
import * as userCenterService from '@/server/services/user-center';

async function handlePATCH(request: NextRequest) {
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
    return handleApiError(error);
  }
}

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
export const PATCH = withApiAudit(handlePATCH as unknown as RouteHandler);
