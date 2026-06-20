import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createApiContext } from '@/server/api/session';
import { apiError, internalError, mapDomainError } from '@/server/api/errors';
import { DomainError } from '@/server/errors';
import { withApiAudit, type RouteHandler } from '@/server/api/audit-wrapper';
import * as storageConfig from '@/server/services/storage-config';

const idSchema = z.string().uuid();

/**
 * @openapi
 * @summary Enable a storage replica
 * @description Health-checks a configured replica and starts an idempotent Database backfill. Admin only.
 * @tag Storage
 * @auth bearer
 * @response StorageBackendView
 */
async function handlePOST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!idSchema.safeParse(id).success) return apiError('NOT_FOUND', 'Backend not found', 404);
  try {
    return NextResponse.json(await storageConfig.enableBackend(await createApiContext(), id), {
      status: 202,
    });
  } catch (error) {
    if (error instanceof DomainError) return mapDomainError(error);
    return internalError();
  }
}

export const POST = withApiAudit(handlePOST as unknown as RouteHandler);
