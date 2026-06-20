import { NextResponse, type NextRequest } from 'next/server';
import { migrationStartSchema } from '@next-wiki/shared';
import { createApiContext } from '@/server/api/session';
import { parseJson, formatZodError } from '@/server/api/validate';
import { apiError, mapDomainError, internalError } from '@/server/api/errors';
import { DomainError } from '@/server/errors';
import { withApiAudit, type RouteHandler } from '@/server/api/audit-wrapper';
import * as migrationService from '@/server/services/migration';
import { enqueue, QUEUES } from '@/server/jobs/runtime';

/**
 * Start a backend migration.
 *
 * @openapi
 * @summary Start a storage migration
 * @description Starts a safe copy-verify-cutover migration to the target backend and returns immediately with the migration id. Admin only.
 * @tag Storage
 * @auth bearer
 * @body MigrationStartInput
 * @response 202:MigrationView
 */
async function handlePOST(request: NextRequest) {
  const ctx = await createApiContext();
  const body = await request.json().catch(() => ({}));
  const parsed = parseJson(migrationStartSchema, body);
  if (!parsed.ok) {
    return apiError('BAD_REQUEST', formatZodError(parsed.error), 400);
  }

  try {
    const { id } = await migrationService.startMigration(ctx, parsed.data);
    await enqueue(QUEUES.migration, { migrationId: id });
    return NextResponse.json({ id, status: 'pending' }, { status: 202 });
  } catch (error) {
    if (error instanceof DomainError) return mapDomainError(error);
    return internalError();
  }
}

/**
 * List recent migrations.
 *
 * @openapi
 * @summary List storage migrations
 * @description Returns recent migrations. Admin only.
 * @tag Storage
 * @auth bearer
 * @response MigrationList
 */
async function handleGET() {
  const ctx = await createApiContext();
  try {
    const items = await migrationService.listMigrations(ctx);
    return NextResponse.json({ items });
  } catch (error) {
    if (error instanceof DomainError) return mapDomainError(error);
    return internalError();
  }
}

export const POST = withApiAudit(handlePOST as unknown as RouteHandler);
export const GET = withApiAudit(handleGET as unknown as RouteHandler);
