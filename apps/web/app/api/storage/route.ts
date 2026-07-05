import { NextResponse, type NextRequest } from 'next/server';
import { storageBackendUpsertSchema } from '@next-wiki/shared';
import { createApiContext } from '@/server/api/session';
import { parseJson, formatZodError } from '@/server/api/validate';
import { apiError, mapDomainError, internalError } from '@/server/api/errors';
import { DomainError } from '@/server/errors';
import { withApiAudit, type RouteHandler } from '@/server/api/audit-wrapper';
import * as storageConfig from '@/server/services/storage-config';

async function handleGET() {
  const ctx = await createApiContext();
  try {
    const overview = await storageConfig.getOverview(ctx);
    if (!overview) return apiError('NOT_FOUND', 'Not found', 404);
    return NextResponse.json(overview);
  } catch (error) {
    if (error instanceof DomainError) return mapDomainError(error);
    return internalError();
  }
}

async function handlePUT(request: NextRequest) {
  const ctx = await createApiContext();
  const body = await request.json().catch(() => ({}));
  const parsed = parseJson(storageBackendUpsertSchema, body);
  if (!parsed.ok) {
    return apiError('BAD_REQUEST', formatZodError(parsed.error), 400);
  }

  try {
    const view = await storageConfig.upsertBackend(ctx, parsed.data);
    return NextResponse.json(view);
  } catch (error) {
    if (error instanceof DomainError) return mapDomainError(error);
    return internalError();
  }
}

/**
 * Get the storage overview.
 *
 * @openapi
 * @summary Get storage configuration
 * @description Returns the active backend, all configured primary backends, the Git export target, and any in-progress migration. Admin only; secrets are never included.
 * @tag Storage
 * @auth bearer
 * @response StorageOverview
 */
export const GET = withApiAudit(handleGET as unknown as RouteHandler);
/**
 * Create or update a backend configuration.
 *
 * @openapi
 * @summary Configure a storage backend
 * @description Creates or updates a primary backend's non-secret configuration and optional write-only secret. Does not activate it. Admin only.
 * @tag Storage
 * @auth bearer
 * @body StorageBackendUpsert
 * @response StorageBackendView
 */
export const PUT = withApiAudit(handlePUT as unknown as RouteHandler);
