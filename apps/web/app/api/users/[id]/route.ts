import { NextResponse, type NextRequest } from 'next/server';
import { createApiContext } from '@/server/api/session';
import { uuidSchema, parseParams, formatZodError } from '@/server/api/validate';
import { apiError, mapDomainError, internalError } from '@/server/api/errors';
import { DomainError } from '@/server/errors';
import { withApiAudit, type RouteHandler } from '@/server/api/audit-wrapper';
import * as userService from '@/server/services/users';

async function handleDELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await createApiContext();
  const { id } = await params;
  const parsedId = parseParams(uuidSchema, id);
  if (!parsedId.ok) {
    return apiError('BAD_REQUEST', formatZodError(parsedId.error), 400);
  }

  try {
    await userService.deleteUser(ctx, parsedId.data);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof DomainError) return mapDomainError(error);
    return internalError();
  }
}

/**
 * Delete a user.
 *
 * @openapi
 * @summary Delete user
 * @description Soft-deletes the specified user, hiding it from management and
 *   blocking authentication while preserving authorship. Admin only. Deleting
 *   your own account is refused.
 * @tag Users
 * @auth bearer
 * @response OkResponse
 */
export const DELETE = withApiAudit(handleDELETE as unknown as RouteHandler);
