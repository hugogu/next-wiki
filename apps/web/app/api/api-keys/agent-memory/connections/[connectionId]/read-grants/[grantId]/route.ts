import { NextResponse } from 'next/server';
import { createApiContext } from '@/server/api/session';
import { uuidSchema, parseParams, formatZodError } from '@/server/api/validate';
import { apiError, handleApiError } from '@/server/api/errors';
import { withApiAudit, type RouteHandler } from '@/server/api/audit-wrapper';
import * as agentMemoryManagement from '@/server/services/agent-memory-management';

async function handleDELETE(request: Request, { params }: { params: Promise<{ connectionId: string; grantId: string }> }) {
  const ctx = await createApiContext();
  const { grantId } = await params;
  const parsed = parseParams(uuidSchema, grantId);
  if (!parsed.ok) {
    return apiError('BAD_REQUEST', formatZodError(parsed.error), 400);
  }

  try {
    await agentMemoryManagement.revokeGrant(ctx, parsed.data);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * Revoke an Agent memory read grant.
 *
 * @openapi
 * @summary Revoke an Agent memory read grant
 * @description Immediately revokes a connection's read access to a shared destination. Session-only; not callable with a Bearer key.
 * @tag User
 * @response 204
 */
export const DELETE = withApiAudit(handleDELETE as unknown as RouteHandler);
