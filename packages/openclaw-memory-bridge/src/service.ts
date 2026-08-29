import type { WikiApiClient } from './api-client.js';
import { Outbox, type OutboxEntry } from './outbox.js';

export type ServiceLogger = {
  debug?(message: string): void;
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
};

export type CaptureDeliveryServiceOptions = {
  outbox: Outbox;
  client: WikiApiClient;
  logger: ServiceLogger;
  pollIntervalMs?: number;
  stopDrainBudgetMs?: number;
};

function isTerminalFailureStatus(status: unknown): boolean {
  return status === 'failed' || status === 'cancelled';
}

/**
 * Drains the local outbox against the shared v1 evidence endpoint. Registered
 * as an `OpenClawPluginService` (id/start/stop); this class only implements
 * the delivery loop so it stays unit-testable without a running Gateway.
 */
export class CaptureDeliveryService {
  private timer: ReturnType<typeof setInterval> | undefined;
  private stopped = true;
  private readonly inFlight = new Set<Promise<void>>();

  constructor(private readonly options: CaptureDeliveryServiceOptions) {}

  async start(): Promise<void> {
    this.stopped = false;
    // Gateway-start recovery: an entry stranded `in_flight` by a prior crash
    // goes back to pending before normal draining begins.
    await this.options.outbox.recover();
    const interval = this.options.pollIntervalMs ?? 5_000;
    this.timer = setInterval(() => {
      void this.drainOnce();
    }, interval);
    // Fire-and-forget: start() itself must return promptly even if the first
    // drain's delivery attempts are slow or hanging (P7 / never block on
    // network from a lifecycle-adjacent call path).
    void this.drainOnce();
  }

  /** Aborts active requests only by abandoning them past the drain budget; entries stay pending for the next start. */
  async stop(): Promise<void> {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    const budget = this.options.stopDrainBudgetMs ?? 5_000;
    await Promise.race([
      Promise.allSettled([...this.inFlight]),
      new Promise<void>((resolve) => setTimeout(resolve, budget)),
    ]);
  }

  async drainOnce(): Promise<void> {
    if (this.stopped) return;
    const deliverable = await this.options.outbox.listDeliverable();
    for (const entry of deliverable) {
      if (this.stopped) return;
      const task = this.deliver(entry);
      this.inFlight.add(task);
      await task.finally(() => this.inFlight.delete(task));
    }
  }

  private async deliver(entry: OutboxEntry): Promise<void> {
    await this.options.outbox.markInFlight(entry.eventId);
    try {
      const submitted = await this.options.client.submitEvidence({
        idempotencyKey: entry.eventId,
        sessionDigest: entry.sessionDigest,
        checkpoint: entry.checkpoint,
        captureKind: entry.captureKind,
        messages: entry.messages,
      });
      if (isTerminalFailureStatus(submitted.status)) {
        await this.reportFailure(entry, 'rejected');
        return;
      }
      await this.options.outbox.recordDelivered(entry.eventId);
      // Log only the capture identity and delivery status — never content.
      this.options.logger.info(`agent memory capture ${entry.eventId} ${String(submitted.status ?? 'accepted')}`);
    } catch {
      await this.reportFailure(entry, 'errored');
    }
  }

  private async reportFailure(entry: OutboxEntry, kind: 'rejected' | 'errored'): Promise<void> {
    const result = await this.options.outbox.recordFailure(entry.eventId);
    if ('quarantined' in result) {
      this.options.logger.warn(`agent memory capture ${entry.eventId} ${kind}; no longer tracked locally`);
    } else {
      this.options.logger.warn(`agent memory capture ${entry.eventId} ${kind}; retrying at ${new Date(result.retryAt).toISOString()}`);
    }
  }
}
