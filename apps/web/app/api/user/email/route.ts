import { NextResponse, type NextRequest } from 'next/server';
import { changeEmailInputSchema } from '@next-wiki/shared';
import { createApiContext } from '@/server/api/session';
import { parseJson, formatZodError } from '@/server/api/validate';
import { apiError, handleApiError } from '@/server/api/errors';
import { withApiAudit, type RouteHandler } from '@/server/api/audit-wrapper';
import * as userCenterService from '@/server/services/user-center';

async function handlePATCH(request: NextRequest) {
  const ctx = await createApiContext();
  const body = await request.json().catch(() => ({}));
  const parsed = parseJson(changeEmailInputSchema, body);
  if (!parsed.ok) {
    return apiError('BAD_REQUEST', formatZodError(parsed.error), 400);
  }

  try {
    const result = await userCenterService.changeEmail(ctx, parsed.data);
    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * Change email.
 *
 * @openapi
 * @summary Change email
 * @description Changes the signed-in user's email address.
 * @tag User
 * @auth bearer
 * @body ChangeEmailInput
 * @response ChangeEmailOutputSchema
 */
export const PATCH = withApiAudit(handlePATCH as unknown as RouteHandler);
