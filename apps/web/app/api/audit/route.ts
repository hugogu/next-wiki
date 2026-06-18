import { NextResponse, type NextRequest } from 'next/server';
import { auditQueryParamsSchema } from '@next-wiki/shared';
import { createApiContext } from '@/server/api/session';
import { parseQuery, formatZodError } from '@/server/api/validate';
import { apiError, mapDomainError, internalError } from '@/server/api/errors';
import { DomainError } from '@/server/errors';
import { withApiAudit, type RouteHandler } from '@/server/api/audit-wrapper';
import * as auditService from '@/server/services/audit';

/**
 * List own audit entries.
 *
 * @openapi
 * @summary List own audit entries
 * @description Returns a paginated list of API audit entries for the signed-in user.
 * @tag User
 * @auth bearer
 * @response AuditListResponse
 */
async function handleGET(request: NextRequest) {
  const ctx = await createApiContext();
  const parsed = parseQuery(auditQueryParamsSchema, request.nextUrl.searchParams);
  if (!parsed.ok) {
    return apiError('BAD_REQUEST', formatZodError(parsed.error), 400);
  }

  try {
    const result = await auditService.listOwn(ctx, parsed.data);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof DomainError) return mapDomainError(error);
    return internalError();
  }
}

export const GET = withApiAudit(handleGET as unknown as RouteHandler);
