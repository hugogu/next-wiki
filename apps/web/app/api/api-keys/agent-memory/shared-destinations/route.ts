import { NextResponse } from 'next/server';
import { agentMemoryCreateSharedDestinationInputSchema } from '@next-wiki/shared';
import { createApiContext } from '@/server/api/session';
import { parseJson, formatZodError } from '@/server/api/validate';
import { apiError, handleApiError } from '@/server/api/errors';
import { withApiAudit, type RouteHandler } from '@/server/api/audit-wrapper';
import * as agentMemoryManagement from '@/server/services/agent-memory-management';

async function handleGET() {
  const ctx = await createApiContext();
  try {
    const destinations = await agentMemoryManagement.listSharedDestinations(ctx);
    return NextResponse.json(destinations);
  } catch (error) {
    return handleApiError(error);
  }
}

async function handlePOST(request: Request) {
  const ctx = await createApiContext();
  const body = await request.json().catch(() => ({}));
  const parsed = parseJson(agentMemoryCreateSharedDestinationInputSchema, body);
  if (!parsed.ok) {
    return apiError('BAD_REQUEST', formatZodError(parsed.error), 400);
  }

  try {
    const result = await agentMemoryManagement.createSharedDestination(ctx, parsed.data);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * List the current owner's shared Agent memory destinations.
 *
 * @openapi
 * @summary List shared Agent memory destinations
 * @description Returns the owner's shared destinations available for read grants and promotion. Session-only; not callable with a Bearer key.
 * @tag User
 * @response AgentMemorySharedDestinationList
 */
export const GET = withApiAudit(handleGET as unknown as RouteHandler);
/**
 * Create a shared Agent memory destination.
 *
 * @openapi
 * @summary Create a shared Agent memory destination
 * @description Creates a new owner-curated shared destination. Never written to directly by an agent credential. Session-only; not callable with a Bearer key.
 * @tag User
 * @body AgentMemoryCreateSharedDestinationInput
 * @response 201:AgentMemorySharedDestination
 */
export const POST = withApiAudit(handlePOST as unknown as RouteHandler);
