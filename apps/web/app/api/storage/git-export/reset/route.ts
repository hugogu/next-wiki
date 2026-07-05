import { NextResponse } from 'next/server';
import { createApiContext } from '@/server/api/session';
import { internalError, mapDomainError } from '@/server/api/errors';
import { DomainError } from '@/server/errors';
import { withApiAudit, type RouteHandler } from '@/server/api/audit-wrapper';
import { resetGitExport } from '@/server/services/git-export';

async function handlePOST() {
  try {
    return NextResponse.json(await resetGitExport(await createApiContext()));
  } catch (error) {
    if (error instanceof DomainError) return mapDomainError(error);
    return internalError();
  }
}

/**
 * @openapi
 * @summary Cancel a stuck Git sync
 * @description Cancels pending git-export jobs and clears a sync stuck in backfilling.
 * @tag Storage
 * @auth bearer
 * @response StorageBackendView
 */
export const POST = withApiAudit(handlePOST as unknown as RouteHandler);
