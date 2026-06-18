import { NextResponse, type NextRequest } from 'next/server';
import { setRoleInputSchema } from '@next-wiki/shared';
import { createApiContext } from '@/server/api/session';
import { uuidSchema, parseParams, parseJson, formatZodError } from '@/server/api/validate';
import { apiError, mapDomainError, internalError } from '@/server/api/errors';
import { DomainError } from '@/server/errors';
import { withApiAudit, type RouteHandler } from '@/server/api/audit-wrapper';
import * as userService from '@/server/services/users';

/**
 * Set a user's role.
 *
 * @openapi
 * @summary Set user role
 * @description Changes the role of the specified user. Admin only.
 * @tag Users
 * @auth bearer
 * @body SetRoleInput
 * @response OkResponse
 */
async function handlePOST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await createApiContext();
  const { id } = await params;
  const parsedId = parseParams(uuidSchema, id);
  if (!parsedId.ok) {
    return apiError('BAD_REQUEST', formatZodError(parsedId.error), 400);
  }

  const body = await request.json().catch(() => ({}));
  const parsedBody = parseJson(setRoleInputSchema, body);
  if (!parsedBody.ok) {
    return apiError('BAD_REQUEST', formatZodError(parsedBody.error), 400);
  }

  try {
    await userService.setRole(ctx, parsedId.data, parsedBody.data.role);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof DomainError) return mapDomainError(error);
    return internalError();
  }
}

export const POST = withApiAudit(handlePOST as unknown as RouteHandler);
