import { NextRequest, NextResponse } from 'next/server';
import { agentMemoryDestinationCreateSchema } from '@next-wiki/shared';
import { createApiContext } from '@/server/api/session';
import { handleApiError } from '@/server/api/errors';
import { formatZodError, parseJson } from '@/server/api/validate';
import { withApiAudit, type RouteHandler } from '@/server/api/audit-wrapper';
import * as grants from '@/server/services/agent-memory-grants';

async function handlePOST(request: NextRequest) {
  const parsed = parseJson(agentMemoryDestinationCreateSchema, await request.json().catch(() => ({})));
  if (!parsed.ok) return NextResponse.json({ code: 'BAD_REQUEST', message: formatZodError(parsed.error) }, { status: 400 });
  try {
    return NextResponse.json(await grants.createDestination(await createApiContext(), {
      displayName: parsed.data.displayName,
      role: parsed.data.role ?? 'shared',
    }), { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}

export const POST = withApiAudit(handlePOST as unknown as RouteHandler);
