import { NextResponse } from 'next/server';
import { setStatusInputSchema } from '@next-wiki/shared';
import { createApiContext } from '@/server/api/session';
import { uuidSchema, parseParams, parseJson, formatZodError } from '@/server/api/validate';
import { apiError, mapDomainError, internalError } from '@/server/api/errors';
import { DomainError } from '@/server/errors';
import * as userService from '@/server/services/users';

/**
 * Set a user's status.
 *
 * @openapi
 * @summary Set user status
 * @description Enables or disables the specified user. Admin only.
 * @tag Users
 * @auth bearer
 * @body SetStatusInput
 * @response OkResponse
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await createApiContext();
  const { id } = await params;
  const parsedId = parseParams(uuidSchema, id);
  if (!parsedId.ok) {
    return apiError('BAD_REQUEST', formatZodError(parsedId.error), 400);
  }

  const body = await request.json().catch(() => ({}));
  const parsedBody = parseJson(setStatusInputSchema, body);
  if (!parsedBody.ok) {
    return apiError('BAD_REQUEST', formatZodError(parsedBody.error), 400);
  }

  try {
    await userService.setStatus(ctx, parsedId.data, parsedBody.data.status);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof DomainError) return mapDomainError(error);
    return internalError();
  }
}
