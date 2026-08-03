import { NextResponse } from 'next/server';
import { createApiContext } from '@/server/api/session';
import { internalError, mapDomainError } from '@/server/api/errors';
import { DomainError } from '@/server/errors';
import { withApiAudit, type RouteHandler } from '@/server/api/audit-wrapper';
import { assertCanManageStaticSite } from '@/server/services/static-site';
import { summarizeEligibility } from '@/server/static-site/eligibility';

async function handleGET() {
  try {
    const ctx = await createApiContext();
    assertCanManageStaticSite(ctx);
    return NextResponse.json(await summarizeEligibility(), {
      headers: { 'cache-control': 'no-store' },
    });
  } catch (error) {
    if (error instanceof DomainError) return mapDomainError(error);
    return internalError();
  }
}

/**
 * @openapi
 * @summary Get static site eligibility summary
 * @description Returns publishable and excluded page counts grouped by exclusion reason. Titles and paths are never returned. Admin only.
 * @tag StaticSite
 * @auth bearer
 * @response StaticSiteEligibilitySummary
 */
export const GET = withApiAudit(handleGET as unknown as RouteHandler);
