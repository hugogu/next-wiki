import { NextResponse, type NextRequest } from 'next/server';
import { createApiContext } from '@/server/api/session';
import { internalError, mapDomainError } from '@/server/api/errors';
import { DomainError } from '@/server/errors';
import { withApiAudit, type RouteHandler } from '@/server/api/audit-wrapper';
import { getKeyReuseOffer, reuseGitExportKey } from '@/server/services/static-site';

async function handleGET(request: NextRequest) {
  const remoteUrl = request.nextUrl.searchParams.get('remoteUrl') ?? '';
  try {
    return NextResponse.json(await getKeyReuseOffer(await createApiContext(), remoteUrl));
  } catch (error) {
    if (error instanceof DomainError) return mapDomainError(error);
    return internalError();
  }
}

/**
 * @openapi
 * @summary Check whether the Git export deploy key can be reused
 * @description Reports whether the configured Git export SSH key targets the same repository, in which case it can serve both features. Hosts enforce deploy-key uniqueness globally, so reuse is only possible within one repository.
 * @tag StaticSite
 * @auth bearer
 * @response StaticSiteKeyReuseOffer
 */
export const GET = withApiAudit(handleGET as unknown as RouteHandler);

async function handlePOST() {
  try {
    return NextResponse.json(await reuseGitExportKey(await createApiContext()), { status: 201 });
  } catch (error) {
    if (error instanceof DomainError) return mapDomainError(error);
    return internalError();
  }
}

/**
 * @openapi
 * @summary Reuse the Git export deploy key
 * @description Copies the Git export SSH key onto the publishing target so no second deploy key has to be registered. A copy, not a reference: the two features stay independent.
 * @tag StaticSite
 * @auth bearer
 * @response StaticSiteKeyReuseResult
 */
export const POST = withApiAudit(handlePOST as unknown as RouteHandler);
