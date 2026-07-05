import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createApiContext } from '@/server/api/session';
import { apiError, mapDomainError, internalError } from '@/server/api/errors';
import { DomainError } from '@/server/errors';
import { withApiAudit, type RouteHandler } from '@/server/api/audit-wrapper';
import * as migrationService from '@/server/services/migration';

const idSchema = z.string().uuid();

async function handleGET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await createApiContext();
  const { id } = await params;
  if (!idSchema.safeParse(id).success) return apiError('NOT_FOUND', 'Not found', 404);
  try {
    const view = await migrationService.getMigration(ctx, id);
    if (!view) return apiError('NOT_FOUND', 'Migration not found', 404);
    return NextResponse.json(view);
  } catch (error) {
    if (error instanceof DomainError) return mapDomainError(error);
    return internalError();
  }
}

async function handleDELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await createApiContext();
  const { id } = await params;
  if (!idSchema.safeParse(id).success) return apiError('NOT_FOUND', 'Not found', 404);
  try {
    const view = await migrationService.requestAbort(ctx, id);
    return NextResponse.json(view, { status: 202 });
  } catch (error) {
    if (error instanceof DomainError) return mapDomainError(error);
    return internalError();
  }
}

/**
 * Get migration status.
 *
 * @openapi
 * @summary Get migration status
 * @description Returns the progress of a migration for polling. Admin only.
 * @tag Storage
 * @auth bearer
 * @response MigrationView
 */
export const GET = withApiAudit(handleGET as unknown as RouteHandler);
/**
 * Request a migration abort.
 *
 * @openapi
 * @summary Abort a migration
 * @description Requests a cooperative abort; the worker stops at its next checkpoint and never cuts over after the request. Admin only.
 * @tag Storage
 * @auth bearer
 * @response 202:MigrationView
 */
export const DELETE = withApiAudit(handleDELETE as unknown as RouteHandler);
