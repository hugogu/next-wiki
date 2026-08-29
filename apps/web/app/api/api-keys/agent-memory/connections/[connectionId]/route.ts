import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createApiContext } from '@/server/api/session';
import { uuidSchema, parseParams, parseJson, formatZodError } from '@/server/api/validate';
import { apiError, handleApiError } from '@/server/api/errors';
import { withApiAudit, type RouteHandler } from '@/server/api/audit-wrapper';
import * as agentMemoryManagement from '@/server/services/agent-memory-management';

const patchBodySchema = z.object({ state: z.literal('disabled') });

async function handlePATCH(request: Request, { params }: { params: Promise<{ connectionId: string }> }) {
  const ctx = await createApiContext();
  const { connectionId } = await params;
  const parsedParams = parseParams(uuidSchema, connectionId);
  if (!parsedParams.ok) {
    return apiError('BAD_REQUEST', formatZodError(parsedParams.error), 400);
  }
  const body = await request.json().catch(() => ({}));
  const parsedBody = parseJson(patchBodySchema, body);
  if (!parsedBody.ok) {
    return apiError('BAD_REQUEST', formatZodError(parsedBody.error), 400);
  }

  try {
    const result = await agentMemoryManagement.disableConnection(ctx, parsedParams.data);
    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}

async function handleDELETE(request: Request, { params }: { params: Promise<{ connectionId: string }> }) {
  const ctx = await createApiContext();
  const { connectionId } = await params;
  const parsed = parseParams(uuidSchema, connectionId);
  if (!parsed.ok) {
    return apiError('BAD_REQUEST', formatZodError(parsed.error), 400);
  }

  try {
    await agentMemoryManagement.revokeConnection(ctx, parsed.data);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * Disable an Agent memory connection.
 *
 * @openapi
 * @summary Disable an Agent memory connection
 * @description Temporarily denies operations for a connection without revoking it. Session-only; not callable with a Bearer key.
 * @tag User
 * @body AgentMemoryDisableConnectionInput
 * @response AgentMemoryConnectionSummary
 */
export const PATCH = withApiAudit(handlePATCH as unknown as RouteHandler);
/**
 * Revoke an Agent memory connection.
 *
 * @openapi
 * @summary Revoke an Agent memory connection
 * @description Permanently denies operations for a connection. Session-only; not callable with a Bearer key.
 * @tag User
 * @response 204
 */
export const DELETE = withApiAudit(handleDELETE as unknown as RouteHandler);
