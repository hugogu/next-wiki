import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createApiContext } from '@/server/api/session';
import { apiError, mapDomainError, internalError } from '@/server/api/errors';
import { DomainError } from '@/server/errors';
import { withApiAudit, type RouteHandler } from '@/server/api/audit-wrapper';
import * as cleanupService from '@/server/services/cleanup';

const idSchema = z.string().uuid();

async function handleGET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await createApiContext();
  const { id } = await params;
  if (!idSchema.safeParse(id).success) return apiError('NOT_FOUND', 'Not found', 404);
  try {
    const view = await cleanupService.getCleanupJob(ctx, id);
    if (!view) return apiError('NOT_FOUND', 'Cleanup job not found', 404);
    return NextResponse.json(view);
  } catch (error) {
    if (error instanceof DomainError) return mapDomainError(error);
    return internalError();
  }
}

/**
 * Get cleanup job status.
 *
 * @openapi
 * @summary Get cleanup status
 * @description Returns the progress of a retained-backend cleanup job. Admin only.
 * @tag Storage
 * @auth bearer
 * @response CleanupJobView
 */
export const GET = withApiAudit(handleGET as unknown as RouteHandler);
