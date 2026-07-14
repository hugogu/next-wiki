import type {
  FeishuTransport,
  InboundFeishuEvent,
  OutboundMessage,
  WebhookParseResult,
} from './transport-types';

/**
 * Deterministic in-memory `FeishuTransport` for tests. It does not import the
 * Feishu SDK, so unit, webhook-route, and integration tests run without network
 * or credentials.
 *
 * `parseWebhook` reads a test-shaped JSON envelope instead of performing real
 * AES/GCM decryption:
 *
 *   { "type": "url_verification", "challenge": "abc" }
 *   { "type": "event", "event": { ...InboundFeishuEvent } }
 *   { "__invalid": "bad-signature" }              // forces an invalid result
 *
 * A header `x-fake-invalid: <reason>` also forces an invalid result, letting
 * webhook tests exercise the signature/freshness rejection path.
 */
export class FakeFeishuTransport implements FeishuTransport {
  /** Every message handed to `sendMessage`, in call order. */
  readonly sent: OutboundMessage[] = [];
  private sendCounter = 0;

  parseWebhook(
    rawBody: string,
    headers: Record<string, string | undefined>,
  ): WebhookParseResult {
    const forced = headers['x-fake-invalid'];
    if (forced) return { kind: 'invalid', reason: forced };

    let envelope: unknown;
    try {
      envelope = JSON.parse(rawBody);
    } catch {
      return { kind: 'invalid', reason: 'malformed-json' };
    }
    if (typeof envelope !== 'object' || envelope === null) {
      return { kind: 'invalid', reason: 'not-an-object' };
    }
    const record = envelope as Record<string, unknown>;
    if (typeof record.__invalid === 'string') {
      return { kind: 'invalid', reason: record.__invalid };
    }
    if (record.type === 'url_verification' && typeof record.challenge === 'string') {
      return { kind: 'url_verification', challenge: record.challenge };
    }
    if (record.type === 'event' && typeof record.event === 'object' && record.event !== null) {
      return { kind: 'event', event: record.event as InboundFeishuEvent };
    }
    return { kind: 'invalid', reason: 'unrecognized-envelope' };
  }

  async sendMessage(message: OutboundMessage): Promise<{ providerMessageId: string }> {
    this.sent.push(message);
    this.sendCounter += 1;
    return { providerMessageId: `om_fake_${this.sendCounter}` };
  }

  reset(): void {
    this.sent.length = 0;
    this.sendCounter = 0;
  }
}
