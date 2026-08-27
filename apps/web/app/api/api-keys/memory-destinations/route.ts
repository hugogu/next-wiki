import { NextResponse } from 'next/server';
import { createApiContext } from '@/server/api/session';
import { internalError, mapDomainError } from '@/server/api/errors';
import { DomainError } from '@/server/errors';
import { withApiAudit, type RouteHandler } from '@/server/api/audit-wrapper';
import * as apiKeyService from '@/server/services/api-keys';

async function handleGET() {
  const ctx = await createApiContext();
  try {
    return NextResponse.json(
      await apiKeyService.listMemoryDestinations(ctx),
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch (error) {
    if (error instanceof DomainError) return mapDomainError(error);
    return internalError();
  }
}

/**
 * List the current user's reusable Agent memory destinations.
 *
 * @openapi
 * @summary List Agent memory destinations
 * @description Returns the current user's active or disabled Agent memory destinations. Session-only; not callable with a Bearer key.
 * @tag User
 */
export const GET = withApiAudit(handleGET as unknown as RouteHandler);
