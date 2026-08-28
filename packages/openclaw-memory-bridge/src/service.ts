import type { BridgeConfig } from './config';
import type { WikiMemoryClient } from './api-client';
import { diagnostics } from './diagnostics';
import type { CaptureEvent } from './capture';
import { FileOutbox } from './outbox';

export class MemoryBridgeService {
  readonly outbox: FileOutbox<CaptureEvent>;
  private stopping = false;
  private draining = false;
  private activeDrain: Promise<void> | null = null;
  private lastError: unknown;

  constructor(private readonly config: BridgeConfig, private readonly client: WikiMemoryClient, stateDir: string) {
    this.outbox = new FileOutbox<CaptureEvent>(stateDir, config.outbox);
  }

  async start(): Promise<void> {
    this.stopping = false;
    await this.outbox.open();
    try {
      if (typeof this.client.connection === 'function') await this.client.connection();
      this.lastError = undefined;
    } catch (error) {
      // A Gateway restart should remain usable while the Wiki is offline; the
      // outbox retains work and diagnostics expose the safe failure category.
      this.lastError = error;
    }
    void this.startDrain();
  }

  async stop(): Promise<void> {
    this.stopping = true;
    const drain = this.activeDrain ?? this.startDrain(2_000);
    await Promise.race([
      drain,
      new Promise<void>((resolve) => setTimeout(resolve, 2_000)),
    ]);
  }

  async enqueue(event: CaptureEvent): Promise<void> {
    if (this.stopping) return;
    await this.outbox.enqueue(event.eventId, event);
    void this.startDrain();
  }

  status(): Record<string, unknown> {
    return diagnostics(this.outbox, this.lastError);
  }

  private async drain(deadlineMs = 0): Promise<void> {
    if (this.draining) return;
    this.draining = true;
    const startedAt = Date.now();
    try {
      while (deadlineMs === 0 || Date.now() - startedAt < deadlineMs) {
        const entry = await this.outbox.claim();
        if (!entry) return;
        try {
          const captureRequest = this.client.capture({
            idempotencyKey: entry.id,
            sessionDigest: entry.payload.sessionDigest,
            checkpoint: entry.payload.checkpoint,
            messages: entry.payload.messages,
            origin: entry.payload.checkpoint ? 'checkpoint' : 'automatic_capture',
          });
          if (deadlineMs > 0) {
            const remaining = Math.max(1, deadlineMs - (Date.now() - startedAt));
            await Promise.race([
              captureRequest,
              new Promise<never>((_, reject) => setTimeout(() => reject(new Error('shutdown_deadline')), remaining)),
            ]);
          } else {
            await captureRequest;
          }
          await this.outbox.acknowledge(entry.id);
          this.lastError = undefined;
        } catch (error) {
          this.lastError = error;
          await this.outbox.fail(entry.id, error instanceof Error ? error.name : 'delivery_failed', entry.attempts >= 8);
          if (deadlineMs > 0) return;
        }
      }
    } finally {
      this.draining = false;
    }
  }

  private startDrain(deadlineMs = 0): Promise<void> {
    if (this.activeDrain) return this.activeDrain;
    this.activeDrain = this.drain(deadlineMs).finally(() => {
      this.activeDrain = null;
    });
    return this.activeDrain;
  }
}
