import type { FeishuTransport, OutboundMessage, ProcessingReaction } from './transport-types';

/**
 * Deterministic in-memory `FeishuTransport` for tests. It does not import the
 * Feishu SDK, so unit and integration tests run without network or credentials.
 */
export class FakeFeishuTransport implements FeishuTransport {
  /** Every message handed to `sendMessage`, in call order. */
  readonly sent: OutboundMessage[] = [];
  readonly addedProcessingReactions: ProcessingReaction[] = [];
  readonly removedProcessingReactions: ProcessingReaction[] = [];
  /** When true, `sendMessage` throws to exercise retry/backoff paths. */
  failSends = false;
  private sendCounter = 0;

  async sendMessage(message: OutboundMessage): Promise<{ providerMessageId: string }> {
    if (this.failSends) throw new Error('fake send failure');
    this.sent.push(message);
    this.sendCounter += 1;
    return { providerMessageId: `om_fake_${this.sendCounter}` };
  }

  async addProcessingReaction(messageId: string): Promise<ProcessingReaction> {
    const reaction = {
      messageId,
      reactionId: `reaction_fake_${this.addedProcessingReactions.length + 1}`,
    };
    this.addedProcessingReactions.push(reaction);
    return reaction;
  }

  async removeProcessingReaction(reaction: ProcessingReaction): Promise<void> {
    this.removedProcessingReactions.push(reaction);
  }

  reset(): void {
    this.sent.length = 0;
    this.addedProcessingReactions.length = 0;
    this.removedProcessingReactions.length = 0;
    this.sendCounter = 0;
    this.failSends = false;
  }
}
