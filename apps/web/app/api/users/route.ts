import { NextResponse, type NextRequest } from 'next/server';
import { createUserInputSchema } from '@next-wiki/shared';
import { createApiContext } from '@/server/api/session';
import { formatZodError, parseJson } from '@/server/api/validate';
import { apiError, handleApiError } from '@/server/api/errors';
import { withApiAudit, type RouteHandler } from '@/server/api/audit-wrapper';
import * as userService from '@/server/services/users';

async function handlePOST(request: NextRequest) {
  const parsed = parseJson(createUserInputSchema, await request.json().catch(() => ({})));
  if (!parsed.ok) return apiError('BAD_REQUEST', formatZodError(parsed.error), 400);
  try {
    return NextResponse.json(
      await userService.createUser(await createApiContext(), { ...parsed.data, role: parsed.data.role ?? 'reader' }),
      { status: 201 },
    );
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * @openapi
 * @summary Create user
 * @description Creates a user with a temporary password. Admin only.
 * @tag Users
 * @auth bearer
 * @body CreateUserInput
 * @response 201:UserView
 */
export const POST = withApiAudit(handlePOST as unknown as RouteHandler);
