import { NextResponse, type NextRequest } from 'next/server';
import { staticSiteTargetUpsertSchema } from '@next-wiki/shared';
import { createApiContext } from '@/server/api/session';
import { parseJson, formatZodError } from '@/server/api/validate';
import { apiError, internalError, mapDomainError } from '@/server/api/errors';
import { DomainError } from '@/server/errors';
import { withApiAudit, type RouteHandler } from '@/server/api/audit-wrapper';
import { configureTarget, deleteTarget, getTarget } from '@/server/services/static-site';

async function handleGET() {
  try {
    return NextResponse.json(await getTarget(await createApiContext()));
  } catch (error) {
    if (error instanceof DomainError) return mapDomainError(error);
    return internalError();
  }
}

/**
 * @openapi
 * @summary Get static site publishing target
 * @description Returns the configured static site publishing target with the credential masked, or null when unconfigured. Admin only.
 * @tag StaticSite
 * @auth bearer
 * @response StaticSiteTargetView
 */
export const GET = withApiAudit(handleGET as unknown as RouteHandler);

async function handlePUT(request: NextRequest) {
  const parsed = parseJson(
    staticSiteTargetUpsertSchema,
    await request.json().catch(() => ({})),
  );
  if (!parsed.ok) return apiError('BAD_REQUEST', formatZodError(parsed.error), 400);
  try {
    const result = await configureTarget(await createApiContext(), parsed.data);
    // Enabling queues an initial publish, so the response is 202: the site does
    // not exist yet when this returns.
    return NextResponse.json(result.view, { status: parsed.data.isEnabled ? 202 : 200 });
  } catch (error) {
    if (error instanceof DomainError) return mapDomainError(error);
    return internalError();
  }
}

/**
 * @openapi
 * @summary Configure static site publishing
 * @description Creates or updates the static site publishing target. The credential is write-only and never returned. Enabling queues an initial publish.
 * @tag StaticSite
 * @auth bearer
 * @body StaticSiteTargetUpsert
 * @response StaticSiteTargetView
 */
export const PUT = withApiAudit(handlePUT as unknown as RouteHandler);

async function handleDELETE() {
  try {
    await deleteTarget(await createApiContext());
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    if (error instanceof DomainError) return mapDomainError(error);
    return internalError();
  }
}

/**
 * @openapi
 * @summary Remove static site publishing target
 * @description Removes the configuration and destroys the stored credential. Does not take down an already published site; that is a separate confirmed action.
 * @tag StaticSite
 * @auth bearer
 */
export const DELETE = withApiAudit(handleDELETE as unknown as RouteHandler);
