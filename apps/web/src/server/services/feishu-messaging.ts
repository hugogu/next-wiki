import type { FeishuInboundDisposition, FeishuInboundMessage } from '@next-wiki/shared';
import type { FeishuTransport } from '@/server/feishu/transport-types';
import { feishuCopy } from '@/server/feishu/copy';

/**
 * Send the effects of an inbound-message disposition through the Feishu
 * transport. Binding links are always delivered as a private direct message and
 * never posted to a group (FR-029); a group @-mention only receives a generic,
 * non-sensitive hint that a private message was sent.
 */
export async function actOnDisposition(
  transport: FeishuTransport,
  input: FeishuInboundMessage,
  disposition: FeishuInboundDisposition,
): Promise<void> {
  if (disposition.disposition === 'bind') {
    await sendBindingInstructions(transport, input, disposition.bindUrl);
  }
  // 'question_queued' answers are delivered asynchronously by the delivery
  // worker (US2). 'ignored' produces no outbound message.
}

async function sendBindingInstructions(
  transport: FeishuTransport,
  input: FeishuInboundMessage,
  bindUrl: string,
): Promise<void> {
  // Always DM the requesting identity with the link.
  await transport.sendMessage({
    target: { type: 'direct', openId: input.openId },
    text: feishuCopy.bindPrompt(bindUrl),
  });
  // For a group @-mention, post only a generic hint — never the link itself.
  if (input.chatType === 'group') {
    await transport.sendMessage({
      target: { type: 'group', chatId: input.chatId },
      text: feishuCopy.groupBindHint(),
    });
  }
}

/** Send a plain-text message to a direct or group target. */
export async function sendText(
  transport: FeishuTransport,
  target: { type: 'direct'; openId: string } | { type: 'group'; chatId: string },
  text: string,
  requestUuid?: string,
): Promise<{ providerMessageId: string }> {
  return transport.sendMessage({ target, text, requestUuid });
}
