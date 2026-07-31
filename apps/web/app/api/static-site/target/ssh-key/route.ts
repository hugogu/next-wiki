import { NextResponse } from 'next/server';
import { createApiContext } from '@/server/api/session';
import { internalError, mapDomainError } from '@/server/api/errors';
import { DomainError } from '@/server/errors';
import { withApiAudit, type RouteHandler } from '@/server/api/audit-wrapper';
import { generateSshKey } from '@/server/services/static-site';

async function handlePOST() {
  try {
    return NextResponse.json(await generateSshKey(await createApiContext()), { status: 201 });
  } catch (error) {
    if (error instanceof DomainError) return mapDomainError(error);
    return internalError();
  }
}

/**
 * @openapi
 * @summary Generate a static site deploy key
 * @description Generates an SSH keypair for the publishing target, stores the private half encrypted, and returns the public half so it can be installed as a deploy key. Publishing is left disabled until the key is installed.
 * @tag StaticSite
 * @auth bearer
 * @response StaticSiteSshKeyResult
 */
export const POST = withApiAudit(handlePOST as unknown as RouteHandler);
