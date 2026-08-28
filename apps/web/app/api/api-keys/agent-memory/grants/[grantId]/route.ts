import { NextRequest, NextResponse } from 'next/server';
import { createApiContext } from '@/server/api/session';
import { handleApiError } from '@/server/api/errors';
import { uuidSchema } from '@/server/api/validate';
import { withApiAudit, type RouteHandler } from '@/server/api/audit-wrapper';
import * as grants from '@/server/services/agent-memory-grants';

export const DELETE = withApiAudit((async (_request: NextRequest, { params }: { params: Promise<{ grantId: string }> }) => {
  const { grantId } = await params;
  if (!uuidSchema.safeParse(grantId).success) return NextResponse.json({ code: 'NOT_FOUND', message: 'Not found' }, { status: 404 });
  try {
    await grants.revokeGrant(await createApiContext(), grantId);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return handleApiError(error);
  }
}) as unknown as RouteHandler);
