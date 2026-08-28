import { NextRequest, NextResponse } from 'next/server';
import { agentMemoryCredentialCreateSchema } from '@next-wiki/shared';
import { createApiContext } from '@/server/api/session';
import { handleApiError } from '@/server/api/errors';
import { formatZodError, parseJson } from '@/server/api/validate';
import { withApiAudit, type RouteHandler } from '@/server/api/audit-wrapper';
import * as connections from '@/server/services/agent-memory-connections';

type Context = { params: Promise<{ connectionId: string }> };

async function handleGET(_request: NextRequest, context: Context) {
  try {
    const { connectionId } = await context.params;
    return NextResponse.json(await connections.listCredentials(await createApiContext(), connectionId), {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

async function handlePOST(request: NextRequest, context: Context) {
  const parsed = parseJson(agentMemoryCredentialCreateSchema, await request.json().catch(() => ({})));
  if (!parsed.ok) return NextResponse.json({ code: 'BAD_REQUEST', message: formatZodError(parsed.error) }, { status: 400 });
  try {
    const { connectionId } = await context.params;
    return NextResponse.json(await connections.issueCredential(await createApiContext(), connectionId, parsed.data), { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}

export const GET = withApiAudit(handleGET as unknown as RouteHandler);
export const POST = withApiAudit(handlePOST as unknown as RouteHandler);
