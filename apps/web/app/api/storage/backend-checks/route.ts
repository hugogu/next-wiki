import { NextResponse, type NextRequest } from 'next/server';
import { backendCheckSchema } from '@next-wiki/shared';
import { createApiContext } from '@/server/api/session';
import { parseJson, formatZodError } from '@/server/api/validate';
import { apiError, mapDomainError, internalError } from '@/server/api/errors';
import { DomainError } from '@/server/errors';
import { withApiAudit, type RouteHandler } from '@/server/api/audit-wrapper';
import * as storageConfig from '@/server/services/storage-config';

/**
 * Run a storage backend connection check.
 *
 * @openapi
 * @summary Check a storage backend
 * @description Validates configuration and runs a health check against a saved backend or an ad-hoc config, without changing any backend state. Admin only.
 * @tag Storage
 * @auth bearer
 * @body BackendCheckInput
 * @response BackendCheckResult
 */
async function handlePOST(request: NextRequest) {
  const ctx = await createApiContext();
  const body = await request.json().catch(() => ({}));
  const parsed = parseJson(backendCheckSchema, body);
  if (!parsed.ok) {
    return apiError('BAD_REQUEST', formatZodError(parsed.error), 400);
  }

  try {
    const result = await storageConfig.checkBackend(ctx, parsed.data);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof DomainError) return mapDomainError(error);
    return internalError();
  }
}

export const POST = withApiAudit(handlePOST as unknown as RouteHandler);
