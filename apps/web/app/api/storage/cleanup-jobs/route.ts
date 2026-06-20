import { NextResponse, type NextRequest } from 'next/server';
import { cleanupStartSchema } from '@next-wiki/shared';
import { createApiContext } from '@/server/api/session';
import { parseJson, formatZodError } from '@/server/api/validate';
import { apiError, mapDomainError, internalError } from '@/server/api/errors';
import { DomainError } from '@/server/errors';
import { withApiAudit, type RouteHandler } from '@/server/api/audit-wrapper';
import * as cleanupService from '@/server/services/cleanup';
import { enqueue, QUEUES } from '@/server/jobs/runtime';

/**
 * Start a retained-backend cleanup.
 *
 * @openapi
 * @summary Start storage cleanup
 * @description Starts a confirmed cleanup of an inactive backend's retained data. Admin only.
 * @tag Storage
 * @auth bearer
 * @body CleanupStartInput
 * @response 202:CleanupJobView
 */
async function handlePOST(request: NextRequest) {
  const ctx = await createApiContext();
  const body = await request.json().catch(() => ({}));
  const parsed = parseJson(cleanupStartSchema, body);
  if (!parsed.ok) {
    return apiError('BAD_REQUEST', formatZodError(parsed.error), 400);
  }

  try {
    const view = await cleanupService.startCleanup(ctx, parsed.data);
    await enqueue(QUEUES.storageCleanup, { jobId: view.jobId });
    return NextResponse.json(view, { status: 202 });
  } catch (error) {
    if (error instanceof DomainError) return mapDomainError(error);
    return internalError();
  }
}

export const POST = withApiAudit(handlePOST as unknown as RouteHandler);
