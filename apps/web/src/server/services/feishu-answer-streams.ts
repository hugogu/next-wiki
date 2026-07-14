import { and, eq } from 'drizzle-orm';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { logger } from '@/server/logger';
import { getFeishuTransport } from '@/server/feishu/transport';
import type { FeishuAnswerStream, FeishuTransport } from '@/server/feishu/transport-types';
import { getProcessingReaction } from './feishu-notifications';
import { getSessionByActionId } from './feishu-sessions';

export type ActiveFeishuAnswerStream = {
  stream: FeishuAnswerStream;
  transport: FeishuTransport;
};

function isScopeError(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : '';
  return /permission|scope|unauthori[sz]ed|access denied/.test(message);
}

async function clearProcessingReaction(
  transport: FeishuTransport,
  actionId: string,
): Promise<void> {
  const reaction = await getProcessingReaction(actionId);
  if (!reaction) return;
  try {
    await transport.removeProcessingReaction(reaction);
  } catch (error) {
    logger.warn('feishu processing reaction could not be removed after streaming', {
      actionId,
      error: error instanceof Error ? error.message : 'unknown',
    });
  }
}

/**
 * Start a native CardKit stream only for an active Feishu-bound user. A scope
 * failure remains non-fatal: the normal durable answer-delivery path sends the
 * completed card instead.
 */
export async function startFeishuAnswerStream(
  actionId: string,
): Promise<ActiveFeishuAnswerStream | null> {
  const [action, session, transport] = await Promise.all([
    db.query.aiActions.findFirst({ where: eq(schema.aiActions.id, actionId) }),
    getSessionByActionId(actionId),
    getFeishuTransport(),
  ]);
  if (!action || !session || !transport) return null;

  const binding = await db.query.feishuBindings.findFirst({
    where: and(
      eq(schema.feishuBindings.id, session.bindingId),
      eq(schema.feishuBindings.status, 'active'),
    ),
    with: { user: { columns: { status: true } } },
  });
  if (!binding || binding.user?.status !== 'active') return null;

  try {
    const stream = await transport.startAnswerStream({
      target: { type: 'direct', openId: binding.openId },
      requestUuid: actionId,
    });
    await db
      .update(schema.aiActions)
      .set({
        requestMetadata: {
          ...(action.requestMetadata as Record<string, unknown>),
          feishuStreamingAnswer: true,
        },
      })
      .where(eq(schema.aiActions.id, actionId));
    return { stream, transport };
  } catch (error) {
    logger.warn('feishu native answer stream could not start', {
      actionId,
      error: error instanceof Error ? error.message : 'unknown',
    });
    if (isScopeError(error)) {
      try {
        await transport.requestPendingScopes();
        await transport.sendMessage({
          target: { type: 'direct', openId: binding.openId },
          text:
            '流式回复所需的飞书卡片权限尚未获批，已向租户管理员提交授权申请。本次会继续以完整卡片回复。',
          requestUuid: `${actionId}-scope-request`,
        });
      } catch (scopeError) {
        logger.warn('feishu pending scope request could not be submitted', {
          actionId,
          error: scopeError instanceof Error ? scopeError.message : 'unknown',
        });
      }
    }
    return null;
  }
}

export async function completeFeishuAnswerStream(
  active: ActiveFeishuAnswerStream,
  actionId: string,
  citations: { title: string; url: string }[],
): Promise<void> {
  await active.stream.complete(citations);
  await clearProcessingReaction(active.transport, actionId);
}

export async function failFeishuAnswerStream(
  active: ActiveFeishuAnswerStream,
  actionId: string,
): Promise<void> {
  await active.stream.fail();
  await clearProcessingReaction(active.transport, actionId);
}
