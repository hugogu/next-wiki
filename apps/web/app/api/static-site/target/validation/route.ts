import { NextResponse, type NextRequest } from 'next/server';
import { createApiContext } from '@/server/api/session';
import { internalError, mapDomainError } from '@/server/api/errors';
import { DomainError } from '@/server/errors';
import { withApiAudit, type RouteHandler } from '@/server/api/audit-wrapper';
import { validateTarget } from '@/server/services/static-site';

async function handlePOST(_request: NextRequest) {
  try {
    return NextResponse.json(await validateTarget(await createApiContext()));
  } catch (error) {
    if (error instanceof DomainError) return mapDomainError(error);
    return internalError();
  }
}

/**
 * @openapi
 * @summary Validate the static site publishing target
 * @description Performs a dry-run connectivity and write-permission check against the configured target using the shared GitHub integration's credential. Returns a result that is safe to display — credential material is stripped from the message before it leaves the service. Admin only.
 * @tag StaticSite
 * @auth bearer
 * @response StaticSiteValidationResult
 */
export const POST = withApiAudit(handlePOST as unknown as RouteHandler);