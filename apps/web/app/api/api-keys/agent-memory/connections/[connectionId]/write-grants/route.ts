import { NextRequest, NextResponse } from 'next/server';
import { agentMemoryGrantCreateSchema } from '@next-wiki/shared';
import { createApiContext } from '@/server/api/session';
import { handleApiError } from '@/server/api/errors';
import { formatZodError, parseJson, uuidSchema } from '@/server/api/validate';
import { withApiAudit, type RouteHandler } from '@/server/api/audit-wrapper';
import * as grants from '@/server/services/agent-memory-grants';

type Context = { params: Promise<{ connectionId: string }> };

async function handleGET(_request: NextRequest, { params }: Context) {
  const { connectionId } = await params;
  if (!uuidSchema.safeParse(connectionId).success) return NextResponse.json({ code: 'NOT_FOUND', message: 'Not found' }, { status: 404 });
  try {
    return NextResponse.json(await grants.listGrants(await createApiContext(), connectionId, 'write'), { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    return handleApiError(error);
  }
}

async function handlePOST(request: NextRequest, { params }: Context) {
  const { connectionId } = await params;
  if (!uuidSchema.safeParse(connectionId).success) return NextResponse.json({ code: 'NOT_FOUND', message: 'Not found' }, { status: 404 });
  const parsed = parseJson(agentMemoryGrantCreateSchema.extend({ capability: agentMemoryGrantCreateSchema.shape.capability.default('write') }), await request.json().catch(() => ({})));
  if (!parsed.ok) return NextResponse.json({ code: 'BAD_REQUEST', message: formatZodError(parsed.error) }, { status: 400 });
  try {
    return NextResponse.json(await grants.createGrant(await createApiContext(), { connectionId, destinationId: parsed.data.destinationId, capability: 'write', expiresAt: parsed.data.expiresAt }), { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}

export const GET = withApiAudit(handleGET as unknown as RouteHandler);
export const POST = withApiAudit(handlePOST as unknown as RouteHandler);
