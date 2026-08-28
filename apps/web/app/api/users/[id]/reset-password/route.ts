import { NextResponse, type NextRequest } from 'next/server';
import { resetPasswordInputSchema } from '@next-wiki/shared';
import { createApiContext } from '@/server/api/session';
import { uuidSchema, parseParams, parseJson, formatZodError } from '@/server/api/validate';
import { apiError, handleApiError } from '@/server/api/errors';
import { withApiAudit, type RouteHandler } from '@/server/api/audit-wrapper';
import * as userService from '@/server/services/users';

async function handlePOST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await createApiContext();
  const { id } = await params;
  const parsedId = parseParams(uuidSchema, id);
  if (!parsedId.ok) {
    return apiError('BAD_REQUEST', formatZodError(parsedId.error), 400);
  }

  const body = await request.json().catch(() => ({}));
  const parsedBody = parseJson(resetPasswordInputSchema, body);
  if (!parsedBody.ok) {
    return apiError('BAD_REQUEST', formatZodError(parsedBody.error), 400);
  }

  try {
    await userService.resetPassword(ctx, parsedId.data, parsedBody.data.tempPassword);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * Reset a user's password.
 *
 * @openapi
 * @summary Reset user password
 * @description Resets the password of the specified user and forces a reset on next login. Admin only.
 * @tag Users
 * @auth bearer
 * @body ResetPasswordInput
 * @response OkResponse
 */
export const POST = withApiAudit(handlePOST as unknown as RouteHandler);
