// Transport-layer types for the in-process Feishu integration. The real client
// (transport.ts) wraps the Feishu SDK for message delivery; the SDK long
// connection normalizes inbound events before they reach this boundary. Tests
// substitute a deterministic double without the SDK, network, or credentials.

export interface InboundFeishuMessage {
  messageId: string;
  openId: string;
  chatId: string;
  chatType: 'p2p' | 'group';
  mentionedBot: boolean;
  text: string;
}

export interface InboundFeishuEvent {
  eventType: string;
  tenantKey: string;
  /** Feishu `event_id`; message events additionally carry `message`. */
  eventId: string;
  message?: InboundFeishuMessage;
}

export interface OutboundMessage {
  target: { type: 'direct'; openId: string } | { type: 'group'; chatId: string };
  text?: string;
  card?: unknown;
  /** Stable idempotency key forwarded to Feishu as its request `uuid`. */
  requestUuid?: string;
}

export type ProcessingReaction = {
  messageId: string;
  reactionId: string;
};

export type FeishuAnswerStream = {
  append(text: string): Promise<void>;
  complete(citations: { title: string; url: string }[]): Promise<void>;
  fail(): Promise<void>;
};

export interface FeishuTransport {
  sendMessage(message: OutboundMessage): Promise<{ providerMessageId: string }>;
  startAnswerStream(message: OutboundMessage): Promise<FeishuAnswerStream>;
  /** Ask the tenant administrator to approve any app scopes still pending. */
  requestPendingScopes(): Promise<void>;
  addProcessingReaction(messageId: string): Promise<ProcessingReaction>;
  removeProcessingReaction(reaction: ProcessingReaction): Promise<void>;
}
