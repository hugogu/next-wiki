import { NextResponse, type NextRequest } from 'next/server';
import { storageBackendDisableSchema } from '@next-wiki/shared';
import { z } from 'zod';
import { createApiContext } from '@/server/api/session';
import { apiError, internalError, mapDomainError } from '@/server/api/errors';
import { parseJson, formatZodError } from '@/server/api/validate';
import { DomainError } from '@/server/errors';
import { withApiAudit, type RouteHandler } from '@/server/api/audit-wrapper';
import * as storageConfig from '@/server/services/storage-config';
import * as cleanup from '@/server/services/cleanup';

const idSchema = z.string().uuid();

/**
 * @openapi
 * @summary Disable a storage replica
 * @description Removes a replica from read and write routing. Optionally schedules deletion of retained replica data. Admin only.
 * @tag Storage
 * @auth bearer
 * @body StorageBackendDisable
 * @response StorageBackendView
 */
async function handlePOST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!idSchema.safeParse(id).success) return apiError('NOT_FOUND', 'Backend not found', 404);
  const parsed = parseJson(
    storageBackendDisableSchema,
    await request.json().catch(() => ({})),
  );
  if (!parsed.ok) return apiError('BAD_REQUEST', formatZodError(parsed.error), 400);

  const ctx = await createApiContext();
  try {
    const view = await storageConfig.disableBackend(ctx, id, !parsed.data.retainData);
    if (!parsed.data.retainData) {
      await cleanup.startCleanup(ctx, { backendId: id, confirm: true });
    }
    return NextResponse.json(view);
  } catch (error) {
    if (error instanceof DomainError) return mapDomainError(error);
    return internalError();
  }
}

export const POST = withApiAudit(handlePOST as unknown as RouteHandler);
