import type { FeishuInboundDisposition, FeishuInboundMessage } from '@next-wiki/shared';
import { getActiveBinding, issueBindingToken, touchBinding } from './feishu-bindings';

/**
 * In-process delegation entry point. The webhook route hands a validated,
 * deduplicated inbound message here; this service — not the caller — resolves
 * the effective Wiki user from the confirmed binding alone.
 *
 * US1 handles binding disposition only. US2 extends the bound-user branch to
 * queue a grounded question via `createWikiQuestion` under the bound user's
 * permission context.
 */
export async function handleInboundMessage(
  input: FeishuInboundMessage,
): Promise<FeishuInboundDisposition> {
  const correlationId = input.correlationId;

  // A group message must explicitly @-mention the bot to be actionable.
  if (input.chatType === 'group' && !input.mentionedBot) {
    return { disposition: 'ignored', correlationId };
  }

  const binding = await getActiveBinding(input.openId);
  if (!binding) {
    // Unbound: issue a single-use link. The messaging layer decides delivery
    // (always a private DM, never a group post).
    const { url } = await issueBindingToken(input.openId);
    return { disposition: 'bind', bindUrl: url, correlationId };
  }

  await touchBinding(binding.id);
  // Bound users have no Q&A capability until US2; a bound message is a no-op.
  return { disposition: 'ignored', correlationId };
}
