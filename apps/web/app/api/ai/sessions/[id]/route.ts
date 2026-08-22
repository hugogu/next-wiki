import { NextResponse, type NextRequest } from 'next/server';
import { createApiContext } from '@/server/api/session';
import { apiError, internalError, mapDomainError } from '@/server/api/errors';
import { DomainError } from '@/server/errors';
import { deleteConversation, getConversationDetail } from '@/server/services/ai-actions';
import { getLatestConversationSnapshot } from '@/server/services/raw-conversations';
import { getAnonymousAiAccessToken } from '@/server/services/auth';

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
    const detail = await getConversationDetail(ctx, id, await getAnonymousAiAccessToken());
    if (!detail) return apiError('NOT_FOUND', 'Not found', 404);
    // Action events are purged at `ai_settings.event_retention_hours` (24h by
    // default), so a conversation older than that reconstructs to nothing even
    // though its turns still list. A captured conversation keeps a durable
    // snapshot on its Raw page (023) — attach it so the client can render a
    // session whose event log is already gone. Composed here rather than in
    // getConversationDetail because ai-actions.ts cannot import
    // raw-conversations.ts without a cycle (see cleanupExpiredAiData).
    const pointer = detail.conversation.rawConversation;
    if (pointer) {
      const conversation = await getLatestConversationSnapshot(pointer.pageId);
      if (conversation) detail.conversation.rawConversation = { ...pointer, conversation };
    }
    return NextResponse.json(detail);
  } catch (error) {
    if (error instanceof DomainError) return mapDomainError(error);
    return internalError();
  }
}

/**
 * Permanently delete a conversation (every turn) and any Raw Conversation
 * pages captured from it. This is not reversible.
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
