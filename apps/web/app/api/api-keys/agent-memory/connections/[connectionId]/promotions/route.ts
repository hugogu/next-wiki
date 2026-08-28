import { NextRequest, NextResponse } from 'next/server';
import { agentMemoryPromotionInputSchema } from '@next-wiki/shared';
import { createApiContext } from '@/server/api/session';
import { handleApiError } from '@/server/api/errors';
import { formatZodError, parseJson, uuidSchema } from '@/server/api/validate';
import { withApiAudit, type RouteHandler } from '@/server/api/audit-wrapper';
import { promoteRecord } from '@/server/services/agent-memory';

type Context = { params: Promise<{ connectionId: string }> };

async function handlePOST(request: NextRequest, { params }: Context) {
  const { connectionId } = await params;
  if (!uuidSchema.safeParse(connectionId).success) return NextResponse.json({ code: 'NOT_FOUND', message: 'Not found' }, { status: 404 });
  const parsed = parseJson(agentMemoryPromotionInputSchema, await request.json().catch(() => ({})));
  if (!parsed.ok) return NextResponse.json({ code: 'BAD_REQUEST', message: formatZodError(parsed.error) }, { status: 400 });
  try {
    return NextResponse.json(await promoteRecord(await createApiContext(), connectionId, parsed.data), { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}

export const POST = withApiAudit(handlePOST as unknown as RouteHandler);
