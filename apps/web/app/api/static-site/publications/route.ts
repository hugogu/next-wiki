import { NextResponse, type NextRequest } from 'next/server';
import { createApiContext } from '@/server/api/session';
import { handleApiError } from '@/server/api/errors';
import { withApiAudit, type RouteHandler } from '@/server/api/audit-wrapper';
import { listPublications, publishNow } from '@/server/services/static-site';

async function handleGET(request: NextRequest) {
  try {
    const limit = Number(request.nextUrl.searchParams.get('limit') ?? '20');
    const items = await listPublications(
      await createApiContext(),
      Number.isFinite(limit) ? limit : 20,
    );
    return NextResponse.json({ items });
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * @openapi
 * @summary List static site publish runs
 * @description Returns publish run history for the configured target, newest first. Admin only.
 * @tag StaticSite
 * @auth bearer
 * @response StaticSitePublicationListResponse
 */
export const GET = withApiAudit(handleGET as unknown as RouteHandler);

async function handlePOST() {
  try {
    // Publishing is background work: this returns the queued run, not a site.
    return NextResponse.json(await publishNow(await createApiContext()), { status: 202 });
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * @openapi
 * @summary Start a static site publish
 * @description Queues a full publish of the public site. Returns immediately with the queued run; triggers arriving during an active run collapse into a single follow-up.
 * @tag StaticSite
 * @auth bearer
 * @response StaticSitePublicationView
 */
export const POST = withApiAudit(handlePOST as unknown as RouteHandler);
