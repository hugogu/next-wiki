import { NextResponse } from 'next/server';
import { createApiContext } from '@/server/api/session';
import { handleApiError } from '@/server/api/errors';
import { withApiAudit, type RouteHandler } from '@/server/api/audit-wrapper';
import * as agentMemoryManagement from '@/server/services/agent-memory-management';

async function handleGET() {
  const ctx = await createApiContext();
  try {
    const grants = await agentMemoryManagement.listGrants(ctx);
    return NextResponse.json(grants);
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * List every Agent memory read grant the current owner has created.
 *
 * @openapi
 * @summary List Agent memory read grants
 * @description Returns every read grant the current owner has created, across all connections and shared destinations. Session-only; not callable with a Bearer key.
 * @tag User
 * @response AgentMemoryDestinationGrantList
 */
export const GET = withApiAudit(handleGET as unknown as RouteHandler);
