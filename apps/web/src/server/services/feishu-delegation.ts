import type { FeishuInboundDisposition, FeishuInboundMessage } from '@next-wiki/shared';
import { buildUserCtx } from '@/server/permissions';
import { DomainError } from '@/server/errors';
import { createToolEnabledWikiQuestion, createWikiQuestion } from '@/server/services/ai-question';
import { writeEntry } from '@/server/services/audit';
import { feishuCopy } from '@/server/feishu/copy';
import type { ProcessingReaction } from '@/server/feishu/transport-types';
import { getActiveBinding, issueBindingToken, touchBinding } from './feishu-bindings';
import { getDecryptedConfig } from './feishu-config';
import { isWithinRateLimit } from './feishu-inbox';
import {
  attachActionToSession,
  getConversationContext,
  getOrCreateActiveSession,
  isResetCommand,
  resetSession,
} from './feishu-sessions';

/** DomainError codes that mean AI Q&A is unavailable by configuration/policy. */
const AI_DISABLED_CODES = new Set(['AI_DISABLED', 'AI_FEATURE_DISABLED', 'AI_NOT_CONFIGURED']);

type ProcessingReactionLifecycle = {
  start(messageId: string): Promise<ProcessingReaction | null>;
  stop(reaction: ProcessingReaction): Promise<void>;
};

/**
 * In-process delegation entry point. The SDK event handler hands a validated,
 * deduplicated inbound message here; this service — not the caller — resolves
 * the effective Wiki user from the confirmed binding alone and reuses the
 * existing AI-question service under that user's permission context.
 */
export async function handleInboundMessage(
  input: FeishuInboundMessage,
  reactionLifecycle?: ProcessingReactionLifecycle,
): Promise<FeishuInboundDisposition> {
  const correlationId = input.correlationId;
  const target = { type: 'direct' as const, openId: input.openId };

  // A group message must explicitly @-mention the bot to be actionable.
  if (input.chatType === 'group' && !input.mentionedBot) {
    return { disposition: 'ignored', correlationId };
  }

  const binding = await getActiveBinding(input.openId);
  if (!binding) {
    // Unbound: issue a single-use link. The messaging layer always delivers it
    // as a private DM, never a group post.
    const { url } = await issueBindingToken(input.openId);
    return { disposition: 'bind', bindUrl: url, correlationId };
  }

  await touchBinding(binding.id);

  // "Start a new conversation" — reset this user's session in this chat only.
  if (isResetCommand(input.text)) {
    await resetSession(binding.id, input.chatId);
    return {
      disposition: 'reply',
      responseTarget: target,
      text: feishuCopy.resetAck(),
      correlationId,
    };
  }

  const question = input.text.trim();
  if (!question) {
    return { disposition: 'ignored', correlationId };
  }

  // Enforce the admin-configurable per-user and per-chat rate limits. The
  // current message's inbox row is already recorded, so limits are inclusive.
  const config = await getDecryptedConfig();
  const withinLimit = await isWithinRateLimit(
    { openId: input.openId, chatId: input.chatId },
    {
      userLimit: config?.userRateLimitPerMinute ?? 10,
      chatLimit: config?.chatRateLimitPerMinute ?? 30,
    },
  );
  if (!withinLimit) {
    return {
      disposition: 'reply',
      responseTarget: target,
      text: feishuCopy.rateLimited(),
      correlationId,
    };
  }

  // Build the bound user's normal permission context — the effective user is
  // derived only from the confirmed binding, never from the message payload.
  const ctx = buildUserCtx(binding.userId, binding.role);
  const session = await getOrCreateActiveSession(binding.id, input.chatId);
  const conversation = await getConversationContext(session.id, binding.userId);
  const processingReaction = await reactionLifecycle?.start(input.messageId);
  const requestMetadata = {
    origin: 'feishu',
    correlationId,
    feishuSessionId: session.id,
    feishuProcessingReaction: processingReaction,
  };

  try {
    const toolQuestion = await createToolEnabledWikiQuestion(ctx, {
      question,
      requestedReview: 'admin_review',
      conversation,
      requestMetadata,
    });
    const action = toolQuestion.fallback
      ? await createWikiQuestion(ctx, {
          question,
          mode: 'retrieval',
          conversation,
          requestMetadata: { ...requestMetadata, toolFallback: true },
        })
      : toolQuestion.action;
    await attachActionToSession(session.id, action.id);
    await writeEntry({
      keyId: null,
      userId: binding.userId,
      entryType: 'api',
      method: 'POST',
      path: 'feishu:websocket',
      statusCode: 202,
      durationMs: 0,
      authStatus: 'authenticated',
      errorMessage: null,
      origin: 'feishu',
      externalCorrelationId: correlationId,
    });
    return {
      disposition: 'question_queued',
      aiActionId: action.id,
      responseTarget: target,
      correlationId,
    };
  } catch (error) {
    if (processingReaction && reactionLifecycle) {
      await reactionLifecycle.stop(processingReaction).catch(() => {});
    }
    if (error instanceof DomainError && AI_DISABLED_CODES.has(error.code)) {
      return {
        disposition: 'reply',
        responseTarget: target,
        text: feishuCopy.aiDisabled(),
        correlationId,
      };
    }
    if (error instanceof DomainError) {
      // Known but non-fatal (e.g. index not ready): a safe generic reply.
      return {
        disposition: 'reply',
        responseTarget: target,
        text: feishuCopy.unavailable(),
        correlationId,
      };
    }
    throw error;
  }
}
