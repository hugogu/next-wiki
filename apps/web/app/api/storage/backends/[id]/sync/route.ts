import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createApiContext } from '@/server/api/session';
import { apiError, internalError, mapDomainError } from '@/server/api/errors';
import { DomainError } from '@/server/errors';
import { withApiAudit, type RouteHandler } from '@/server/api/audit-wrapper';
import * as storageConfig from '@/server/services/storage-config';

const idSchema = z.string().uuid();

async function handleGET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!idSchema.safeParse(id).success) return apiError('NOT_FOUND', 'Backend not found', 404);
  try {
    return NextResponse.json(
      await storageConfig.getReplicaSyncStatus(await createApiContext(), id),
    );
  } catch (error) {
    if (error instanceof DomainError) return mapDomainError(error);
    return internalError();
  }
}

/**
 * @openapi
 * @summary Get storage replica synchronization status
 * @description Returns Database-to-replica backfill progress and errors. Admin only.
 * @tag Storage
 * @auth bearer
 * @response ReplicaSyncStatus
 */
export const GET = withApiAudit(handleGET as unknown as RouteHandler);
