import { NextResponse } from 'next/server';
import { setMyPasswordInputSchema } from '@next-wiki/shared';
import { createApiContext } from '@/server/api/session';
import { parseJson, formatZodError } from '@/server/api/validate';
import { apiError, mapDomainError, internalError } from '@/server/api/errors';
import { DomainError } from '@/server/errors';
import * as authService from '@/server/services/auth';

/**
 * Set my password after a forced reset.
 *
 * @openapi
 * @summary Set my password
 * @description Allows a signed-in user to set a new password after an admin reset.
 * @tag Auth
 * @auth bearer
 * @body SetMyPasswordInput
 * @response OkResponse
 */
export async function POST(request: Request) {
  const ctx = await createApiContext();
  const body = await request.json().catch(() => ({}));
  const parsed = parseJson(setMyPasswordInputSchema, body);
  if (!parsed.ok) {
    return apiError('BAD_REQUEST', formatZodError(parsed.error), 400);
  }

  try {
    await authService.setMyPassword(ctx, parsed.data.newPassword);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof DomainError) return mapDomainError(error);
    return internalError();
  }
}
