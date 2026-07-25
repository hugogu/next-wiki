import type { AiConversationDetail, AiConversationSummary } from '@next-wiki/shared';

/**
 * When continuing a historical conversation, keep the original `webSessionId` so
 * the server groups the new turn under the same conversation. Legacy uncaptured
 * conversations encode the id in `legacy:<webSessionId>`; captured conversations
 * store it inside the action's `requestMetadata`. Falls back to a fresh UUID.
 */
export function resolveSessionId(conversation: AiConversationSummary, detail: AiConversationDetail): string {
  if (conversation.conversationKey.startsWith('legacy:')) {
    const legacyId = conversation.conversationKey.slice('legacy:'.length);
    // The server falls back to `legacy:turn:{actionId}` for turns that have no
    // webSessionId; those cannot be resumed under the same key, so start fresh.
    if (!legacyId.startsWith('turn:')) return legacyId;
  }
  const latest = detail.turns[0]?.action;
  const metadata = latest?.requestMetadata as { webSessionId?: string } | undefined;
  if (metadata?.webSessionId) return metadata.webSessionId;
  return crypto.randomUUID();
}
