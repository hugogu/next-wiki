import { NextResponse, type NextRequest } from 'next/server';
import { staticSiteTakedownSchema } from '@next-wiki/shared';
import { createApiContext } from '@/server/api/session';
import { parseJson, formatZodError } from '@/server/api/validate';
import { apiError, internalError, mapDomainError } from '@/server/api/errors';
import { DomainError } from '@/server/errors';
import { withApiAudit, type RouteHandler } from '@/server/api/audit-wrapper';
import { takeDownSite } from '@/server/services/static-site';

async function handleDELETE(request: NextRequest) {
  const parsed = parseJson(
    staticSiteTakedownSchema,
    await request.json().catch(() => ({})),
  );
  if (!parsed.ok) return apiError('BAD_REQUEST', formatZodError(parsed.error), 400);

  try {
    return NextResponse.json(
      await takeDownSite(await createApiContext(), parsed.data.confirm),
      { status: 202 },
    );
  } catch (error) {
    if (error instanceof DomainError) return mapDomainError(error);
    return internalError();
  }
}

/**
 * @openapi
 * @summary Take the published site down
 * @description Removes the published content from the target branch so previously published addresses stop serving. Requires the branch name as confirmation. Runs in the background and appears in publish history.
 * @tag StaticSite
 * @auth bearer
 * @body StaticSiteTakedown
 * @response StaticSitePublicationView
 */
export const DELETE = withApiAudit(handleDELETE as unknown as RouteHandler);
