import type { FeishuTransport, OutboundMessage } from './transport-types';

/**
 * Deterministic in-memory `FeishuTransport` for tests. It does not import the
 * Feishu SDK, so unit and integration tests run without network or credentials.
 */
export class FakeFeishuTransport implements FeishuTransport {
  /** Every message handed to `sendMessage`, in call order. */
  readonly sent: OutboundMessage[] = [];
  /** When true, `sendMessage` throws to exercise retry/backoff paths. */
  failSends = false;
  private sendCounter = 0;

  async sendMessage(message: OutboundMessage): Promise<{ providerMessageId: string }> {
    if (this.failSends) throw new Error('fake send failure');
    this.sent.push(message);
    this.sendCounter += 1;
    return { providerMessageId: `om_fake_${this.sendCounter}` };
  }

  reset(): void {
    this.sent.length = 0;
    this.sendCounter = 0;
    this.failSends = false;
  }
}
