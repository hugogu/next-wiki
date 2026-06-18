import { NextResponse } from 'next/server';
import { createApiContext } from '@/server/api/session';
import { mapDomainError, internalError } from '@/server/api/errors';
import { DomainError } from '@/server/errors';
import { withApiAudit, type RouteHandler } from '@/server/api/audit-wrapper';
import * as userService from '@/server/services/users';

/**
 * List users.
 *
 * @openapi
 * @summary List users
 * @description Returns a list of all users. Admin only.
 * @tag Users
 * @auth bearer
 * @response UserViewList
 */
async function handleGET() {
  const ctx = await createApiContext();
  try {
    const users = await userService.list(ctx);
    return NextResponse.json(users);
  } catch (error) {
    if (error instanceof DomainError) return mapDomainError(error);
    return internalError();
  }
}

export const GET = withApiAudit(handleGET as unknown as RouteHandler);
