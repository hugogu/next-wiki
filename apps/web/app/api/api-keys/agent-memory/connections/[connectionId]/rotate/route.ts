import { NextResponse } from 'next/server';
import { createApiContext } from '@/server/api/session';
import { uuidSchema, parseParams, formatZodError } from '@/server/api/validate';
import { apiError, handleApiError } from '@/server/api/errors';
import { withApiAudit, type RouteHandler } from '@/server/api/audit-wrapper';
import * as agentMemoryManagement from '@/server/services/agent-memory-management';

async function handlePOST(request: Request, { params }: { params: Promise<{ connectionId: string }> }) {
  const ctx = await createApiContext();
  const { connectionId } = await params;
  const parsed = parseParams(uuidSchema, connectionId);
  if (!parsed.ok) {
    return apiError('BAD_REQUEST', formatZodError(parsed.error), 400);
  }

  try {
    const result = await agentMemoryManagement.rotateCredential(ctx, parsed.data);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * Rotate an Agent memory connection's credential.
 *
 * @openapi
 * @summary Rotate an Agent memory connection credential
 * @description Issues a new credential bound to the same connection without revoking the prior one. Session-only; not callable with a Bearer key. The full secret is returned only once.
 * @tag User
 * @response 201:AgentMemoryCredentialRotated
 */
export const POST = withApiAudit(handlePOST as unknown as RouteHandler);
