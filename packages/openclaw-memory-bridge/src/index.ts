import { definePluginEntry, type OpenClawPluginApi } from 'openclaw/plugin-sdk/plugin-entry';
import { parseBridgeConfig, type BridgeConfig } from './config';
import { WikiApiClient } from './api-client';
import { redact } from './redaction';
import { Outbox, OUTBOX_BOUNDS, type OutboxEntry } from './outbox';
import { CaptureDeliveryService } from './service';
import { registerCaptureHooks } from './hooks';
import { registerAgentMemoryTools } from './tools';
import { registerPromptEnrichment } from './prompt-enrichment';

export { parseBridgeConfig, ConfigError, type BridgeConfig } from './config';
export { WikiApiClient, ApiClientError, type RecallScope } from './api-client';
export { redact } from './redaction';
export { Outbox, OUTBOX_BOUNDS } from './outbox';
export { CaptureDeliveryService } from './service';
export { registerAgentMemoryTools } from './tools';
export { registerPromptEnrichment } from './prompt-enrichment';

const PLUGIN_ID = 'next-wiki-memory-bridge';

/**
 * Hook-only / non-capability OpenClaw plugin: it never claims
 * `plugins.slots.memory` (no `registerMemoryCapability` call — confirmed
 * that call exists and is the exclusive slot by inspecting the installed
 * SDK's `OpenClawPluginApi` type), never calls another plugin's private
 * API, and coexists with an installed local memory provider.
 */
export default definePluginEntry({
  id: PLUGIN_ID,
  name: 'Next Wiki Agent Memory',
  description: 'Bridges OpenClaw session lifecycle to the next-wiki generic Agent Memory service.',
  register(api: OpenClawPluginApi) {
    let config: BridgeConfig;
    try {
      config = parseBridgeConfig(api.pluginConfig);
    } catch (error) {
      // The credential is never part of this message (see parseBridgeConfig);
      // still run it through redact() as defense-in-depth against a future
      // error path that might otherwise leak an interpolated secret.
      api.logger.error(redact(error instanceof Error ? error.message : 'invalid Agent memory bridge configuration'));
      throw error;
    }

    const client = new WikiApiClient(config);
    api.logger.info(`Agent memory bridge activated (capture ${config.capture.enabled ? 'enabled' : 'disabled'}).`);

    // Tools and prompt enrichment are independent of capture: an operator may
    // want read-only recall without ever enabling automatic capture.
    registerAgentMemoryTools(api, config, client);
    registerPromptEnrichment(api, config, client);

    if (!config.capture.enabled) return;

    const store = api.runtime.state.openKeyedStore<OutboxEntry>({
      namespace: `${PLUGIN_ID}:outbox`,
      maxEntries: OUTBOX_BOUNDS.maxEntriesPerConnection,
      overflowPolicy: 'reject-new',
      defaultTtlMs: OUTBOX_BOUNDS.ttlMs,
    });
    const outbox = new Outbox(store);
    const deliveryService = new CaptureDeliveryService({ outbox, client, logger: api.logger });

    registerCaptureHooks(api, config, outbox);
    api.registerService({
      id: `${PLUGIN_ID}-delivery`,
      start: () => deliveryService.start(),
      stop: () => deliveryService.stop(),
    });
  },
});
