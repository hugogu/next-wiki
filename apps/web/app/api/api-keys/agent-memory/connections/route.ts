import { NextRequest, NextResponse } from 'next/server';
import { agentMemoryConnectionCreateSchema } from '@next-wiki/shared';
import { createApiContext } from '@/server/api/session';
import { handleApiError } from '@/server/api/errors';
import { formatZodError, parseJson } from '@/server/api/validate';
import { withApiAudit, type RouteHandler } from '@/server/api/audit-wrapper';
import * as connections from '@/server/services/agent-memory-connections';

async function handleGET() {
  try {
    return NextResponse.json(await connections.listConnections(await createApiContext()), {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

async function handlePOST(request: NextRequest) {
  const parsed = parseJson(agentMemoryConnectionCreateSchema, await request.json().catch(() => ({})));
  if (!parsed.ok) return NextResponse.json({ code: 'BAD_REQUEST', message: formatZodError(parsed.error) }, { status: 400 });
  try {
    return NextResponse.json(await connections.createConnection(await createApiContext(), parsed.data), { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}

export const GET = withApiAudit(handleGET as unknown as RouteHandler);
export const POST = withApiAudit(handlePOST as unknown as RouteHandler);
