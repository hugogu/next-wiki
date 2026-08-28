import { NextResponse } from 'next/server';
import { createApiContext } from '@/server/api/session';
import { handleApiError } from '@/server/api/errors';
import { withApiAudit, type RouteHandler } from '@/server/api/audit-wrapper';
import { runGitExportNow } from '@/server/services/git-export';

async function handlePOST() {
  try {
    return NextResponse.json(await runGitExportNow(await createApiContext()), { status: 202 });
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * @openapi
 * @summary Run Git export
 * @description Queues an asynchronous full reconciliation of published Markdown and referenced assets.
 * @tag Storage
 * @auth bearer
 * @response GitExportRunResult
 */
export const POST = withApiAudit(handlePOST as unknown as RouteHandler);
