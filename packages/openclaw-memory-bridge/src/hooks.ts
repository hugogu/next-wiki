import type { OpenClawPluginApi } from 'openclaw/plugin-sdk/plugin-entry';
import type { BridgeConfig, CaptureMode } from './config';
import { buildCaptureRequest } from './capture';
import { Outbox, OutboxCapacityError, OutboxPayloadTooLargeError } from './outbox';

/**
 * Registers only opt-in observation hooks that enqueue locally or reconcile
 * state — never anything that waits on the network or claims to veto/rewrite
 * compaction (the installed SDK's own hook-types documentation confirms
 * `before_compaction`/`after_compaction` accept no rewrite or veto result).
 */
export function registerCaptureHooks(api: OpenClawPluginApi, config: BridgeConfig, outbox: Outbox): void {
  if (!config.capture.enabled || config.capture.modes.length === 0) return;
  const modes = new Set<CaptureMode>(config.capture.modes);

  const enqueue = (captureKind: CaptureMode, sessionId: string | undefined, rawMessages: unknown): void => {
    if (!modes.has(captureKind)) return;
    if (!sessionId) {
      api.logger.debug?.(`agent memory bridge: skipped ${captureKind} capture (no session correlation)`);
      return;
    }
    // buildCaptureRequest is synchronous and pure; only the store write below
    // is async, and it is a single bounded local write, not a network call.
    const request = buildCaptureRequest({ sessionId, captureKind, checkpoint: captureKind === 'checkpoint', rawMessages });
    if (!request) {
      api.logger.debug?.(`agent memory bridge: skipped ${captureKind} capture (no usable content in this lifecycle event)`);
      return;
    }
    void outbox.enqueue({
      eventId: request.eventId,
      captureKind: request.captureKind,
      sessionDigest: request.sessionDigest,
      checkpoint: request.checkpoint,
      messages: request.messages,
    }).catch((error: unknown) => {
      if (error instanceof OutboxCapacityError || error instanceof OutboxPayloadTooLargeError) {
        api.logger.warn(`agent memory bridge: ${error.message}`);
        return;
      }
      api.logger.error('agent memory bridge: failed to enqueue a capture locally');
    });
  };

  api.on('agent_end', (event, ctx) => {
    enqueue('turn', ctx.sessionId, event.messages);
  });

  api.on('before_compaction', (event, ctx) => {
    enqueue('compaction', ctx.sessionId, event.messages);
  });

  // after_compaction carries message counts only (no content) in the
  // installed SDK version — an observation boundary, never a capture source.
  api.on('after_compaction', (event, ctx) => {
    api.logger.debug?.(`agent memory bridge: observed compaction for session ${ctx.sessionId ?? 'unknown'} (${event.compactedCount} messages compacted)`);
  });

  // session_end also carries no message content; there is nothing this hook
  // alone can safely capture (spec.md edge case: missing required content).
  api.on('session_end', (event) => {
    if (modes.has('session_end')) {
      api.logger.debug?.(`agent memory bridge: session ${event.sessionId} ended (reason=${event.reason ?? 'unknown'}); no content available to capture from this event`);
    }
  });

  api.on('gateway_start', () => {
    void outbox.recover().then((pending) => {
      if (pending.length > 0) {
        api.logger.info(`agent memory bridge: recovered ${pending.length} pending capture(s) from a prior run`);
      }
    });
  });

  api.on('gateway_stop', () => {
    void outbox.listDeliverable().then((pending) => {
      if (pending.length > 0) {
        api.logger.info(`agent memory bridge: ${pending.length} capture(s) remain pending locally and will retry on next start`);
      }
    });
  });
}
