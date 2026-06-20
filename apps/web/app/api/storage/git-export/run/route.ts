import { NextResponse } from 'next/server';
import { createApiContext } from '@/server/api/session';
import { internalError, mapDomainError } from '@/server/api/errors';
import { DomainError } from '@/server/errors';
import { withApiAudit, type RouteHandler } from '@/server/api/audit-wrapper';
import { runGitExportNow } from '@/server/services/git-export';

/**
 * @openapi
 * @summary Run Git export
 * @description Queues an asynchronous full reconciliation of published Markdown and referenced assets.
 * @tag Storage
 * @auth bearer
 * @response GitExportRunResult
 */
async function handlePOST() {
  try {
    return NextResponse.json(await runGitExportNow(await createApiContext()), { status: 202 });
  } catch (error) {
    if (error instanceof DomainError) return mapDomainError(error);
    return internalError();
  }
}

export const POST = withApiAudit(handlePOST as unknown as RouteHandler);
