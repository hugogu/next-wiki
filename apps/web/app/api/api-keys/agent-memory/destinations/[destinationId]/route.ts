import { NextRequest, NextResponse } from 'next/server';
import { agentMemoryDestinationStateInputSchema } from '@next-wiki/shared';
import { createApiContext } from '@/server/api/session';
import { handleApiError } from '@/server/api/errors';
import { formatZodError, parseJson, uuidSchema } from '@/server/api/validate';
import { withApiAudit, type RouteHandler } from '@/server/api/audit-wrapper';
import * as grants from '@/server/services/agent-memory-grants';

type Context = { params: Promise<{ destinationId: string }> };

async function handlePATCH(request: NextRequest, { params }: Context) {
  const { destinationId } = await params;
  if (!uuidSchema.safeParse(destinationId).success) return NextResponse.json({ code: 'NOT_FOUND', message: 'Not found' }, { status: 404 });
  const parsed = parseJson(agentMemoryDestinationStateInputSchema, await request.json().catch(() => ({})));
  if (!parsed.ok) return NextResponse.json({ code: 'BAD_REQUEST', message: formatZodError(parsed.error) }, { status: 400 });
  try {
    await grants.setDestinationState(await createApiContext(), destinationId, parsed.data.state);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return handleApiError(error);
  }
}

export const PATCH = withApiAudit(handlePATCH as unknown as RouteHandler);
