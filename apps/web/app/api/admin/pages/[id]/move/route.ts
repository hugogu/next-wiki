import { NextResponse, type NextRequest } from 'next/server';
import { pageMoveInputSchema } from '@next-wiki/shared';
import { createApiContext } from '@/server/api/session';
import { uuidSchema, parseParams, parseJson, formatZodError } from '@/server/api/validate';
import { apiError, mapDomainError, internalError } from '@/server/api/errors';
import { DomainError } from '@/server/errors';
import { withApiAudit, type RouteHandler } from '@/server/api/audit-wrapper';
import { moveToSpace } from '@/server/services/pages';

/**
 * Move a page to another content space (Admin, LLM Wiki mode). Content format is
 * adapted automatically (OKF frontmatter injected when moving into generated).
 */
async function handlePOST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await createApiContext();
  if (ctx.actor.kind !== 'user' || ctx.actor.role !== 'admin') {
    return apiError('FORBIDDEN', 'You do not have permission to manage pages', 403);
  }

  const { id } = await params;
  const parsedId = parseParams(uuidSchema, id);
  if (!parsedId.ok) return apiError('BAD_REQUEST', formatZodError(parsedId.error), 400);

  const parsedBody = parseJson(pageMoveInputSchema, await request.json().catch(() => ({})));
  if (!parsedBody.ok) return apiError('BAD_REQUEST', formatZodError(parsedBody.error), 400);

  try {
    return NextResponse.json(await moveToSpace(ctx, parsedId.data, parsedBody.data));
  } catch (error) {
    if (error instanceof DomainError) return mapDomainError(error);
    return internalError();
  }
}

export const POST = withApiAudit(handlePOST as unknown as RouteHandler);
