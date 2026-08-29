import { NextResponse } from 'next/server';
import { agentMemoryCreateGrantInputSchema } from '@next-wiki/shared';
import { z } from 'zod';
import { createApiContext } from '@/server/api/session';
import { uuidSchema, parseParams, parseJson, formatZodError } from '@/server/api/validate';
import { apiError, handleApiError } from '@/server/api/errors';
import { withApiAudit, type RouteHandler } from '@/server/api/audit-wrapper';
import * as agentMemoryManagement from '@/server/services/agent-memory-management';

const bodySchema = agentMemoryCreateGrantInputSchema.omit({ granteeConnectionId: true }).extend({
  destinationId: z.string().uuid(),
});

async function handlePOST(request: Request, { params }: { params: Promise<{ connectionId: string }> }) {
  const ctx = await createApiContext();
  const { connectionId } = await params;
  const parsedParams = parseParams(uuidSchema, connectionId);
  if (!parsedParams.ok) {
    return apiError('BAD_REQUEST', formatZodError(parsedParams.error), 400);
  }
  const body = await request.json().catch(() => ({}));
  const parsedBody = parseJson(bodySchema, body);
  if (!parsedBody.ok) {
    return apiError('BAD_REQUEST', formatZodError(parsedBody.error), 400);
  }

  try {
    const result = await agentMemoryManagement.createGrant(ctx, parsedBody.data.destinationId, {
      granteeConnectionId: parsedParams.data,
      expiresAt: parsedBody.data.expiresAt,
    });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * Grant a connection read access to a shared Agent memory destination.
 *
 * @openapi
 * @summary Create an Agent memory read grant
 * @description Grants the connection in the path read access to the shared destination in the request body. Session-only; not callable with a Bearer key — an agent credential can never create its own grant.
 * @tag User
 * @body AgentMemoryCreateReadGrantInput
 * @response 201:AgentMemoryDestinationGrant
 */
export const POST = withApiAudit(handlePOST as unknown as RouteHandler);
