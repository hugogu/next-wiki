import { NextRequest, NextResponse } from 'next/server';
import { createApiContext } from '@/server/api/session';
import { handleApiError } from '@/server/api/errors';
import { withApiAudit, type RouteHandler } from '@/server/api/audit-wrapper';
import * as connections from '@/server/services/agent-memory-connections';

type Context = { params: Promise<{ connectionId: string; keyId: string }> };

async function handleDELETE(_request: NextRequest, context: Context) {
  try {
    const { connectionId, keyId } = await context.params;
    await connections.revokeCredential(await createApiContext(), connectionId, keyId);
    return new NextResponse(null, { status: 204, headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    return handleApiError(error);
  }
}

export const DELETE = withApiAudit(handleDELETE as unknown as RouteHandler);
