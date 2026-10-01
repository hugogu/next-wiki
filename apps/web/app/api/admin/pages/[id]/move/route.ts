import { NextResponse, type NextRequest } from 'next/server';
import { pageMoveInputSchema } from '@next-wiki/shared';
import { createApiContext } from '@/server/api/session';
import { uuidSchema, parseParams, parseJson, formatZodError } from '@/server/api/validate';
import { apiError, handleApiError } from '@/server/api/errors';
import { withApiAudit, type RouteHandler } from '@/server/api/audit-wrapper';
import { moveToSpace } from '@/server/services/pages';

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
    return handleApiError(error);
  }
}

/**
 * Move a page to another content space (Admin, LLM Wiki mode). Content format is
 * adapted automatically (OKF frontmatter injected when moving into generated).
 *
 * @openapi
 * @summary Move a page to another content space
 * @description Moves a page into another content space in LLM Wiki mode, adapting its content format to the destination (OKF frontmatter is injected when moving into generated). Administrator session only; not callable with a Bearer key.
 * @tag Admin
 * @pathParams PublicPageIdPathParams
 */
export const POST = withApiAudit(handlePOST as unknown as RouteHandler);
