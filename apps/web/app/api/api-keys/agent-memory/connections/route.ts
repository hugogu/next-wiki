import { NextResponse } from 'next/server';
import { agentMemoryCreateConnectionInputSchema } from '@next-wiki/shared';
import { createApiContext } from '@/server/api/session';
import { parseJson, formatZodError } from '@/server/api/validate';
import { apiError, handleApiError } from '@/server/api/errors';
import { withApiAudit, type RouteHandler } from '@/server/api/audit-wrapper';
import * as agentMemoryManagement from '@/server/services/agent-memory-management';

async function handleGET() {
  const ctx = await createApiContext();
  try {
    const connections = await agentMemoryManagement.listConnections(ctx);
    return NextResponse.json(connections);
  } catch (error) {
    return handleApiError(error);
  }
}

async function handlePOST(request: Request) {
  const ctx = await createApiContext();
  const body = await request.json().catch(() => ({}));
  const parsed = parseJson(agentMemoryCreateConnectionInputSchema, body);
  if (!parsed.ok) {
    return apiError('BAD_REQUEST', formatZodError(parsed.error), 400);
  }

  try {
    const result = await agentMemoryManagement.createConnection(ctx, parsed.data);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * List the current owner's Agent memory connections.
 *
 * @openapi
 * @summary List Agent memory connections
 * @description Returns the current owner's Agent memory connections (product-neutral, stable identities). Session-only; not callable with a Bearer key.
 * @tag User
 * @response AgentMemoryConnectionList
 */
export const GET = withApiAudit(handleGET as unknown as RouteHandler);
/**
 * Create an Agent memory connection.
 *
 * @openapi
 * @summary Create an Agent memory connection
 * @description Creates a new connection with its own private destination and a dedicated credential. Session-only; not callable with a Bearer key. The full credential secret is returned only once.
 * @tag User
 * @body AgentMemoryCreateConnectionInput
 * @response 201:AgentMemoryConnectionCreated
 */
export const POST = withApiAudit(handlePOST as unknown as RouteHandler);
