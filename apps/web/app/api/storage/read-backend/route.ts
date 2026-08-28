import { NextResponse, type NextRequest } from 'next/server';
import { storageReadBackendSchema } from '@next-wiki/shared';
import { createApiContext } from '@/server/api/session';
import { apiError, handleApiError } from '@/server/api/errors';
import { parseJson, formatZodError } from '@/server/api/validate';
import { withApiAudit, type RouteHandler } from '@/server/api/audit-wrapper';
import * as storageConfig from '@/server/services/storage-config';

async function handlePUT(request: NextRequest) {
  const parsed = parseJson(storageReadBackendSchema, await request.json().catch(() => ({})));
  if (!parsed.ok) return apiError('BAD_REQUEST', formatZodError(parsed.error), 400);
  try {
    return NextResponse.json(
      await storageConfig.setPreferredReadBackend(await createApiContext(), parsed.data.backendId),
    );
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * @openapi
 * @summary Set preferred storage read backend
 * @description Selects an enabled replica for preferred reads, or Database when backendId is null. Admin only.
 * @tag Storage
 * @auth bearer
 * @body StorageReadBackend
 * @response StorageBackendView
 */
export const PUT = withApiAudit(handlePUT as unknown as RouteHandler);
