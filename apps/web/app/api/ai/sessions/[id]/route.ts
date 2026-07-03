import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createApiContext } from '@/server/api/session';
import { apiError, internalError, mapDomainError } from '@/server/api/errors';
import { DomainError } from '@/server/errors';
import { getAction, getAllActionEvents, deleteSession } from '@/server/services/ai-actions';

const idSchema = z.string().uuid();

/**
 * Full event log for a single chat session, so the client can reconstruct
 * the question/answer/citations exactly like it would while streaming live.
 *
 * @openapi @summary Get one of my AI chat sessions @tag AI @auth bearer
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await createApiContext();
  const { id } = await params;
  if (!idSchema.safeParse(id).success) return apiError('NOT_FOUND', 'Not found', 404);
  try {
    const action = await getAction(ctx, id);
    if (action.feature !== 'wiki_question') return apiError('NOT_FOUND', 'Not found', 404);
    const events = await getAllActionEvents(ctx, id);
    return NextResponse.json({ action, events });
  } catch (error) {
    if (error instanceof DomainError) return mapDomainError(error);
    return internalError();
  }
}

/** @openapi @summary Permanently delete one of my AI chat sessions @tag AI @auth bearer @response 204 */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await createApiContext();
  const { id } = await params;
  if (!idSchema.safeParse(id).success) return apiError('NOT_FOUND', 'Not found', 404);
  try {
    await deleteSession(ctx, id);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    if (error instanceof DomainError) return mapDomainError(error);
    return internalError();
  }
}
