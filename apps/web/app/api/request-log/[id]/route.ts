import { NextResponse, type NextRequest } from 'next/server';
import { createApiContext } from '@/server/api/session';
import { withApiAudit, type RouteHandler } from '@/server/api/audit-wrapper';
import { internalError, mapDomainError } from '@/server/api/errors';
import { DomainError } from '@/server/errors';
import { getRequestLogDetail } from '@/server/services/request-log';

export const dynamic = 'force-dynamic';

function noStore(response: NextResponse): NextResponse {
  response.headers.set('Cache-Control', 'no-store');
  return response;
}

async function handleGET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    return noStore(NextResponse.json(await getRequestLogDetail(await createApiContext(), id)));
  } catch (error) {
    return noStore(error instanceof DomainError ? mapDomainError(error) : internalError());
  }
}

/**
 * @openapi
 * @summary Read captured outbound request detail
 * @tag Admin
 * @auth bearer
 * @response RequestLogDetailResponse
 */
export const GET = withApiAudit(handleGET as unknown as RouteHandler);
