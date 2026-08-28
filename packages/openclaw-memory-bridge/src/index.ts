import { parseBridgeConfig } from './config';
import { WikiMemoryClient } from './api-client';
import { MemoryBridgeService } from './service';
import { registerLifecycleHooks, registerPromptEnrichment } from './hooks';
import { registerTools } from './tools';
import { externalContext } from './prompt-context';

export type OpenClawPluginApi = {
  config?: unknown;
  runtime?: { state?: { resolveStateDir?: () => string } };
  registerService?: (service: { id: string; start: () => Promise<void>; stop: () => Promise<void> }) => void;
  registerHook?: (name: string, handler: (context: Record<string, unknown>) => unknown, options?: Record<string, unknown>) => void;
  registerTool?: (name: string, handler: (input: Record<string, unknown>) => Promise<unknown>, options?: Record<string, unknown>) => void;
  registerPromptHook?: (handler: (context: Record<string, unknown>) => Promise<Record<string, unknown> | void>, options?: Record<string, unknown>) => void;
  on?: (name: string, handler: (context: Record<string, unknown>) => unknown) => void;
  toolAuthority?: { allows?: (tool: string) => boolean };
  requestPermission?: (request: { tool: string; allowedDecisions: Array<'allow-once' | 'deny'>; title: string }) => Promise<{ decision?: string }>;
};

export function definePluginEntry<T extends (api: OpenClawPluginApi) => unknown>(entry: T): T {
  return entry;
}

const entry = definePluginEntry((api: OpenClawPluginApi) => {
  const config = parseBridgeConfig(api.config ?? {});
  const client = new WikiMemoryClient(config);
  const stateDir = api.runtime?.state?.resolveStateDir?.() ?? '.openclaw';
  const service = new MemoryBridgeService(config, client, stateDir);
  api.registerService?.({ id: 'next-wiki-memory-bridge', start: () => service.start(), stop: () => service.stop() });
  registerLifecycleHooks(api, config, (event) => service.enqueue(event), service.outbox);
  registerTools(api, client, api.requestPermission
    ? async (tool) => (await api.requestPermission!({ tool, allowedDecisions: ['allow-once', 'deny'], title: 'Approve external memory change' })).decision === 'allow-once'
    : undefined);
  if (config.externalContext.enabled) {
    registerPromptEnrichment(api, async (context) => {
      if (!api.toolAuthority?.allows?.('next_wiki_memory_search')) return;
      const query = typeof context.prompt === 'string' ? context.prompt : '';
      const content = await externalContext(client, query, config.externalContext);
      if (typeof context.assertActive === 'function') context.assertActive();
      return content ? { prependContext: content } : undefined;
    });
  }
  return { service, client };
});

export default entry;
export { parseBridgeConfig } from './config';
export { WikiMemoryClient, WikiMemoryError } from './api-client';
export { FileOutbox } from './outbox';
