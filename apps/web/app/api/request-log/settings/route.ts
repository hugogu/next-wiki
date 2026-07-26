import { NextResponse, type NextRequest } from 'next/server';
import { updateRequestLogSettingsSchema } from '@next-wiki/shared';
import { createApiContext } from '@/server/api/session';
import { setApiAuditMetadata } from '@/server/api/api-context-store';
import { withApiAudit, type RouteHandler } from '@/server/api/audit-wrapper';
import { formatZodError, parseJson } from '@/server/api/validate';
import { internalError, mapDomainError } from '@/server/api/errors';
import { DomainError } from '@/server/errors';
import { getRequestLogSettings, updateRequestLogSettings } from '@/server/services/request-log';

export const dynamic = 'force-dynamic';

function noStore(response: NextResponse): NextResponse {
  response.headers.set('Cache-Control', 'no-store');
  return response;
}

async function handleGET() {
  try {
    return noStore(NextResponse.json(await getRequestLogSettings(await createApiContext())));
  } catch (error) {
    return noStore(error instanceof DomainError ? mapDomainError(error) : internalError());
  }
}

async function handlePATCH(request: NextRequest) {
  const parsed = parseJson(updateRequestLogSettingsSchema, await request.json().catch(() => ({})));
  if (!parsed.ok) return noStore(mapDomainError(new DomainError('BAD_REQUEST', formatZodError(parsed.error))));
  try {
    const result = await updateRequestLogSettings(await createApiContext(), parsed.data);
    setApiAuditMetadata(result.auditMetadata);
    return noStore(NextResponse.json(result.settings));
  } catch (error) {
    return noStore(error instanceof DomainError ? mapDomainError(error) : internalError());
  }
}

/**
 * @openapi
 * @summary Read request-log capture settings
 * @tag Admin
 * @auth bearer
 * @response RequestLogSettingsView
 */
export const GET = withApiAudit(handleGET as unknown as RouteHandler);

/**
 * @openapi
 * @summary Update request-log capture settings
 * @tag Admin
 * @auth bearer
 * @body RequestLogSettingsUpdate
 * @response RequestLogSettingsView
 */
export const PATCH = withApiAudit(handlePATCH as unknown as RouteHandler);
