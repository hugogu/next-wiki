// Transport-layer types for the in-process Feishu integration. The real client
// (transport.ts) wraps the Feishu SDK for Event v2 verify/decrypt and message
// send; tests substitute a deterministic double that implements this interface
// without the SDK, network, or credentials.

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

export type WebhookParseResult =
  | { kind: 'url_verification'; challenge: string }
  | { kind: 'event'; event: InboundFeishuEvent }
  | { kind: 'invalid'; reason: string };

export interface OutboundMessage {
  target: { type: 'direct'; openId: string } | { type: 'group'; chatId: string };
  text?: string;
  card?: unknown;
  /** Stable idempotency key forwarded to Feishu as its request `uuid`. */
  requestUuid?: string;
}

export interface FeishuTransport {
  /**
   * Verify + decrypt a raw Event v2 webhook body. Never throws on malformed,
   * unauthentic, or stale input — it returns an `invalid` result so the caller
   * responds with a generic 4xx and discloses nothing.
   */
  parseWebhook(
    rawBody: string,
    headers: Record<string, string | undefined>,
  ): WebhookParseResult;
  sendMessage(message: OutboundMessage): Promise<{ providerMessageId: string }>;
}
