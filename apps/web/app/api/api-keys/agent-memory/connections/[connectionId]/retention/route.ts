import { NextRequest, NextResponse } from 'next/server';
import { agentMemoryRetentionInputSchema } from '@next-wiki/shared';
import { createApiContext } from '@/server/api/session';
import { handleApiError } from '@/server/api/errors';
import { formatZodError, parseJson, uuidSchema } from '@/server/api/validate';
import { withApiAudit, type RouteHandler } from '@/server/api/audit-wrapper';
import * as connections from '@/server/services/agent-memory-connections';
import * as retention from '@/server/services/agent-memory-retention';

type Context = { params: Promise<{ connectionId: string }> };

async function resolveDestination(connectionId: string) {
  const connection = await connections.getConnection(await createApiContext(), connectionId);
  return connection.privateDestinationId;
}

async function handleGET(_request: NextRequest, { params }: Context) {
  const { connectionId } = await params;
  if (!uuidSchema.safeParse(connectionId).success) return NextResponse.json({ code: 'NOT_FOUND', message: 'Not found' }, { status: 404 });
  try {
    const destinationId = await resolveDestination(connectionId);
    return NextResponse.json(await retention.getRetentionPolicy(await createApiContext(), destinationId), { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * @openapi
 * @summary Update private Agent Memory retention metadata
 * @description Changes recall eligibility policy metadata without deleting canonical Raw revisions or expanding grants.
 * @tag Agent Memory management
 * @body AgentMemoryRetentionInput
 */
async function handlePUT(request: NextRequest, { params }: Context) {
  const { connectionId } = await params;
  if (!uuidSchema.safeParse(connectionId).success) return NextResponse.json({ code: 'NOT_FOUND', message: 'Not found' }, { status: 404 });
  const parsed = parseJson(agentMemoryRetentionInputSchema, await request.json().catch(() => ({})));
  if (!parsed.ok) return NextResponse.json({ code: 'BAD_REQUEST', message: formatZodError(parsed.error) }, { status: 400 });
  try {
    const destinationId = await resolveDestination(connectionId);
    return NextResponse.json(await retention.setRetentionPolicy(await createApiContext(), destinationId, parsed.data.retentionDays));
  } catch (error) {
    return handleApiError(error);
  }
}

export const GET = withApiAudit(handleGET as unknown as RouteHandler);
export const PUT = withApiAudit(handlePUT as unknown as RouteHandler);
