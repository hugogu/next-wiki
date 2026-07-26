import { NextResponse, type NextRequest } from 'next/server';
import { requestLogListQuerySchema } from '@next-wiki/shared';
import { createApiContext } from '@/server/api/session';
import { withApiAudit, type RouteHandler } from '@/server/api/audit-wrapper';
import { formatZodError, parseQuery } from '@/server/api/validate';
import { internalError, mapDomainError } from '@/server/api/errors';
import { DomainError } from '@/server/errors';
import { listRequestLogs } from '@/server/services/request-log';

export const dynamic = 'force-dynamic';

function noStore(response: NextResponse): NextResponse {
  response.headers.set('Cache-Control', 'no-store');
  return response;
}

async function handleGET(request: NextRequest) {
  const parsed = parseQuery(requestLogListQuerySchema, request.nextUrl.searchParams);
  if (!parsed.ok) return noStore(mapDomainError(new DomainError('BAD_REQUEST', formatZodError(parsed.error))));
  try {
    return noStore(NextResponse.json(await listRequestLogs(await createApiContext(), parsed.data)));
  } catch (error) {
    return noStore(error instanceof DomainError ? mapDomainError(error) : internalError());
  }
}

/**
 * @openapi
 * @summary List captured outbound requests
 * @tag Admin
 * @auth bearer
 * @response RequestLogListResponse
 */
export const GET = withApiAudit(handleGET as unknown as RouteHandler);
