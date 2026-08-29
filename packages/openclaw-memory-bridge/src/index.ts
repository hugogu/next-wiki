import { definePluginEntry, type OpenClawPluginApi } from 'openclaw/plugin-sdk/plugin-entry';
import { parseBridgeConfig, type BridgeConfig } from './config';
import { WikiApiClient } from './api-client';
import { redact } from './redaction';

export { parseBridgeConfig, ConfigError, type BridgeConfig } from './config';
export { WikiApiClient, ApiClientError, type RecallScope } from './api-client';
export { redact } from './redaction';

/**
 * Hook-only / non-capability OpenClaw plugin: it never claims
 * `plugins.slots.memory`, never calls another plugin's private API, and
 * coexists with an installed local memory provider. Lifecycle capture hooks
 * and the local outbox are wired in a later phase (T029-T032); this entry
 * point only validates configuration and constructs the shared v1 client.
 */
export default definePluginEntry({
  id: 'next-wiki-memory-bridge',
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
    void client;
  },
});
