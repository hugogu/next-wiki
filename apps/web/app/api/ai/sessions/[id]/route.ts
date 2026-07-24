import { NextResponse, type NextRequest } from 'next/server';
import { createApiContext } from '@/server/api/session';
import { apiError, internalError, mapDomainError } from '@/server/api/errors';
import { DomainError } from '@/server/errors';
import { deleteConversation, getConversationDetail } from '@/server/services/ai-actions';

/**
 * Full conversation payload (summary + every turn's action + events) for
 * the user-center history panel's view modal. `{id}` is a conversation key
 * minted by the list endpoint: a `raw_conversation_page_id` for captured
 * conversations, or `legacy:<webSessionId>` for uncaptured ones.
 *
 * @openapi @summary Get one of my AI chat conversations @tag AI @auth bearer
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await createApiContext();
  const { id } = await params;
  if (!id) return apiError('NOT_FOUND', 'Not found', 404);
  try {
    const detail = await getConversationDetail(ctx, id);
    if (!detail) return apiError('NOT_FOUND', 'Not found', 404);
    return NextResponse.json(detail);
  } catch (error) {
    if (error instanceof DomainError) return mapDomainError(error);
    return internalError();
  }
}

/**
 * Permanently delete a conversation (every turn). Refused when any turn
 * was captured as a Raw page; the Raw Conversation page is the canonical,
 * append-only evidence record and outlives the history panel.
 *
 * @openapi @summary Permanently delete one of my AI chat conversations @tag AI @auth bearer @response 204
 */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await createApiContext();
  const { id } = await params;
  if (!id) return apiError('NOT_FOUND', 'Not found', 404);
  try {
    await deleteConversation(ctx, id);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    if (error instanceof DomainError) return mapDomainError(error);
    return internalError();
  }
}