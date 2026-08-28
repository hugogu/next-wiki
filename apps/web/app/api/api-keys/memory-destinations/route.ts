import { NextResponse } from 'next/server';
import { createApiContext } from '@/server/api/session';
import { handleApiError } from '@/server/api/errors';
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
    return handleApiError(error);
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
