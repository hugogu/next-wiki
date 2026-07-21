import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createApiContext } from '@/server/api/session';
import { apiError, internalError, mapDomainError } from '@/server/api/errors';
import { DomainError } from '@/server/errors';
import { getAction, getAllActionEvents, deleteSession, resolveRawConversationPointer } from '@/server/services/ai-actions';
import { getLatestConversationSnapshot } from '@/server/services/raw-conversations';

const idSchema = z.string().uuid();

/**
 * Full event log for a single chat session, so the client can reconstruct
 * the question/answer/citations exactly like it would while streaming live.
 * Captured sessions additionally return `rawConversation`, the Raw-derived
 * canonical view — legacy (uncaptured) sessions keep the events-only shape.
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
    const pointer = await resolveRawConversationPointer(
      action.rawConversationPageId,
      action.rawConversationCaptureStatus,
    );
    const rawConversation = pointer
      ? { ...pointer, conversation: (await getLatestConversationSnapshot(pointer.pageId)) ?? undefined }
      : null;
    return NextResponse.json({ action, events, rawConversation });
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
