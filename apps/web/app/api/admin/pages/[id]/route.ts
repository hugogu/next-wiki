import { NextResponse, type NextRequest } from 'next/server';
import { createApiContext } from '@/server/api/session';
import { uuidSchema, parseParams, formatZodError } from '@/server/api/validate';
import { apiError, mapDomainError, internalError } from '@/server/api/errors';
import { DomainError } from '@/server/errors';
import { withApiAudit, type RouteHandler } from '@/server/api/audit-wrapper';
import * as publicContent from '@/server/services/public-content';

async function handleDELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await createApiContext();
  if (ctx.actor.kind !== 'user' || ctx.actor.role !== 'admin') {
    return apiError('FORBIDDEN', 'You do not have permission to manage pages', 403);
  }

  const { id } = await params;
  const parsedId = parseParams(uuidSchema, id);
  if (!parsedId.ok) {
    return apiError('BAD_REQUEST', formatZodError(parsedId.error), 400);
  }

  try {
    await publicContent.deletePage(ctx, parsedId.data);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof DomainError) return mapDomainError(error);
    return internalError();
  }
}

export const DELETE = withApiAudit(handleDELETE as unknown as RouteHandler);
