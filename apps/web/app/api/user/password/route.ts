import { NextResponse, type NextRequest } from 'next/server';
import { changePasswordInputSchema } from '@next-wiki/shared';
import { createApiContext } from '@/server/api/session';
import { parseJson, formatZodError } from '@/server/api/validate';
import { apiError, mapDomainError, internalError } from '@/server/api/errors';
import { DomainError } from '@/server/errors';
import { withApiAudit, type RouteHandler } from '@/server/api/audit-wrapper';
import * as userCenterService from '@/server/services/user-center';

/**
 * Change password.
 *
 * @openapi
 * @summary Change password
 * @description Changes the signed-in user's password after verifying the current password.
 * @tag User
 * @auth bearer
 * @body ChangePasswordInput
 * @response OkResponse
 */
async function handlePOST(request: NextRequest) {
  const ctx = await createApiContext();
  const body = await request.json().catch(() => ({}));
  const parsed = parseJson(changePasswordInputSchema, body);
  if (!parsed.ok) {
    return apiError('BAD_REQUEST', formatZodError(parsed.error), 400);
  }

  try {
    await userCenterService.changePassword(ctx, parsed.data);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof DomainError) return mapDomainError(error);
    return internalError();
  }
}

export const POST = withApiAudit(handlePOST as unknown as RouteHandler);
