import { NextRequest, NextResponse } from 'next/server';
import { agentMemoryConnectionStateInputSchema } from '@next-wiki/shared';
import { createApiContext } from '@/server/api/session';
import { handleApiError } from '@/server/api/errors';
import { formatZodError, parseJson, uuidSchema } from '@/server/api/validate';
import { withApiAudit, type RouteHandler } from '@/server/api/audit-wrapper';
import * as connections from '@/server/services/agent-memory-connections';

type Context = { params: Promise<{ connectionId: string }> };

async function handlePATCH(request: NextRequest, { params }: Context) {
  const { connectionId } = await params;
  if (!uuidSchema.safeParse(connectionId).success) return NextResponse.json({ code: 'NOT_FOUND', message: 'Not found' }, { status: 404 });
  const parsed = parseJson(agentMemoryConnectionStateInputSchema, await request.json().catch(() => ({})));
  if (!parsed.ok) return NextResponse.json({ code: 'BAD_REQUEST', message: formatZodError(parsed.error) }, { status: 400 });
  try {
    await connections.setConnectionState(await createApiContext(), connectionId, parsed.data.state);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return handleApiError(error);
  }
}

async function handleGET(_request: NextRequest, { params }: Context) {
  const { connectionId } = await params;
  if (!uuidSchema.safeParse(connectionId).success) return NextResponse.json({ code: 'NOT_FOUND', message: 'Not found' }, { status: 404 });
  try {
    return NextResponse.json(await connections.getConnection(await createApiContext(), connectionId), {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export const PATCH = withApiAudit(handlePATCH as unknown as RouteHandler);
export const GET = withApiAudit(handleGET as unknown as RouteHandler);
