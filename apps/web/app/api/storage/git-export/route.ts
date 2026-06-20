import { NextResponse, type NextRequest } from 'next/server';
import { gitExportUpsertSchema } from '@next-wiki/shared';
import { createApiContext } from '@/server/api/session';
import { parseJson, formatZodError } from '@/server/api/validate';
import { apiError, internalError, mapDomainError } from '@/server/api/errors';
import { DomainError } from '@/server/errors';
import { withApiAudit, type RouteHandler } from '@/server/api/audit-wrapper';
import { configureGitExport, getGitExport } from '@/server/services/git-export';

/**
 * @openapi
 * @summary Get Git sync status
 * @description Returns the current Git sync backend view (masked secrets) for status polling. Admin only.
 * @tag Storage
 * @auth bearer
 * @response StorageBackendView
 */
async function handleGET() {
  try {
    return NextResponse.json(await getGitExport(await createApiContext()));
  } catch (error) {
    if (error instanceof DomainError) return mapDomainError(error);
    return internalError();
  }
}

export const GET = withApiAudit(handleGET as unknown as RouteHandler);

/**
 * @openapi
 * @summary Configure Git export
 * @description Configures and enables or disables the one-way published-content Git export. Secrets are write-only. Enabling queues a full snapshot export.
 * @tag Storage
 * @auth bearer
 * @body GitExportUpsert
 * @response StorageBackendView
 */
async function handlePUT(request: NextRequest) {
  const parsed = parseJson(
    gitExportUpsertSchema,
    await request.json().catch(() => ({})),
  );
  if (!parsed.ok) return apiError('BAD_REQUEST', formatZodError(parsed.error), 400);
  try {
    return NextResponse.json(
      await configureGitExport(await createApiContext(), parsed.data),
      { status: parsed.data.enabled ? 202 : 200 },
    );
  } catch (error) {
    if (error instanceof DomainError) return mapDomainError(error);
    return internalError();
  }
}

export const PUT = withApiAudit(handlePUT as unknown as RouteHandler);
