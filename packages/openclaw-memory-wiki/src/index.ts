import { resolveRequiredConfiguredSecretRefInputString } from 'openclaw/plugin-sdk/config-runtime';
import { resolveConfig, type PluginConfig, type SecretInput, type SecretResolver } from './config.js';
import { NextWikiClient } from './client.js';
import { SyncService } from './sync-service.js';
import { createTools } from './tools.js';
import { definePluginEntry } from 'openclaw/plugin-sdk/plugin-entry';

export type OpenClawPluginApi = {
  id?: string;
  config?: Partial<PluginConfig>;
  pluginConfig?: Partial<PluginConfig>;
  resolveSecretRef?: SecretResolver;
  registerTool: (definition: unknown, options?: unknown) => void;
  registerService?: (service: { id: string; start: () => void | Promise<void>; stop?: () => void | Promise<void> }) => void;
  registerSkill?: (path: string) => void;
  onShutdown?: (handler: () => void | Promise<void>) => void;
  logger?: { warn: (message: string) => void; error: (message: string) => void };
};

function hostSecretResolver(api: OpenClawPluginApi, path: string): SecretResolver {
  if (api.resolveSecretRef) return api.resolveSecretRef;
  return async (ref: SecretInput) => {
    if (!api.config) throw new Error('OpenClaw runtime configuration is unavailable');
    const value = await resolveRequiredConfiguredSecretRefInputString({
      config: api.config as never,
      env: process.env,
      value: ref,
      path,
    });
    if (!value) throw new Error(`${path} SecretRef is unresolved`);
    return value;
  };
}

export async function register(api: OpenClawPluginApi): Promise<void> {
  const pluginConfig = api.pluginConfig ?? api.config;
  if (!pluginConfig?.enabled) return;
  const { config, apiKey } = await resolveConfig(pluginConfig, hostSecretResolver(api, `${api.id ?? 'next-wiki-memory-wiki'}.config`));
  const client = new NextWikiClient({ baseUrl: config.baseUrl, apiKey });
  const sync = new SyncService(config.vaultPath, client, config.syncIntervalMinutes);
  for (const definition of Object.values(createTools(client, sync))) {
    api.registerTool(definition, { optional: definition.name === 'next_wiki_sync' });
  }
  api.registerSkill?.('./skills/next-wiki');
  if (api.registerService) {
    api.registerService({ id: 'next-wiki-memory-wiki-sync', start: () => sync.start(), stop: () => sync.stop() });
  } else {
    sync.start();
    api.onShutdown?.(() => sync.stop());
  }
}

export default definePluginEntry({ id: 'next-wiki-memory-wiki', name: 'next-wiki Memory Wiki', description: 'Mirror OpenClaw Memory Wiki into next-wiki and retrieve account knowledge.', register: (api) => { void register(api as unknown as OpenClawPluginApi); } });
