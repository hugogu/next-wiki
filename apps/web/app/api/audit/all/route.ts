import { NextResponse, type NextRequest } from 'next/server';
import { auditQueryParamsSchema } from '@next-wiki/shared';
import { createApiContext } from '@/server/api/session';
import { parseQuery, formatZodError } from '@/server/api/validate';
import { apiError, internalError } from '@/server/api/errors';
import { DomainError } from '@/server/errors';
import { withApiAudit, type RouteHandler } from '@/server/api/audit-wrapper';
import * as auditService from '@/server/services/audit';

/**
 * List all audit entries.
 *
 * @openapi
 * @summary List all audit entries
 * @description Returns a paginated list of all API audit entries. Admin only.
 * @tag Admin
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
    const result = await auditService.listAll(ctx, parsed.data);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof DomainError && error.code === 'FORBIDDEN') {
      return apiError('NOT_FOUND', 'Not found', 404);
    }
    if (error instanceof DomainError) return apiError(error.code, error.message, 404);
    return internalError();
  }
}

export const GET = withApiAudit(handleGET as unknown as RouteHandler);
