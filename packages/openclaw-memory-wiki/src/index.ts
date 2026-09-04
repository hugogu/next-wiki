import { resolveRequiredConfiguredSecretRefInputString } from 'openclaw/plugin-sdk/config-runtime';
import { resolveConfig, type PluginConfig, type SecretInput, type SecretResolver } from './config.js';
import { NextWikiClient } from './client.js';
import { SyncService } from './sync-service.js';
import { createTools } from './tools.js';
import { definePluginEntry } from 'openclaw/plugin-sdk/plugin-entry';
import type { ToolRuntime } from './tools.js';

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

type PluginRuntimeState = {
  initialization?: Promise<ToolRuntime>;
  runtime?: ToolRuntime;
  startupError?: string;
};

function hostSecretResolver(api: OpenClawPluginApi, path: string): SecretResolver {
  if (api.resolveSecretRef) return api.resolveSecretRef;
  return async (ref: SecretInput) => {
    if (!api.config) throw new Error('OpenClaw runtime configuration is unavailable');
    let resolved: string | undefined;
    try {
      resolved = await resolveRequiredConfiguredSecretRefInputString({
        config: api.config as never,
        env: process.env,
        value: ref,
        path,
      });
    } catch (error) {
      // `ref` looked like a SecretRef (env shorthand, template, legacy marker,
      // or object) but the runtime could not resolve it. Surface a clear
      // message while preserving the underlying failure as `cause` so the
      // root reason stays available for debugging.
      throw new Error(`${path} SecretRef is unresolved`, { cause: error });
    }
    if (resolved !== undefined) return resolved;
    // `ref` did not match any SecretRef shape — treat it as an already-resolved
    // literal value forwarded by the runtime.
    if (typeof ref === 'string' && ref.length > 0) return ref;
    throw new Error(`${path} SecretRef is unresolved`);
  };
}

function safeStartupError(error: unknown): string {
  const message = error instanceof Error ? error.message.replace(/[\r\n]/gu, ' ').trim() : '';
  const knownErrors = new Set([
    'baseUrl must use HTTPS or loopback HTTP',
    'API key SecretRef is required',
    'vaultPath must point to an existing directory',
    'syncIntervalMinutes must be between 1 and 1440',
    'API key SecretRef resolved to an empty value',
  ]);
  if (knownErrors.has(message)) return message;
  if (/secret|api[ -]?key|credential|token/iu.test(message)) return 'api_key_resolution_failed';
  return 'plugin_startup_failed';
}

function reportStartupFailure(api: OpenClawPluginApi, error: unknown): void {
  try {
    api.logger?.error(`[next-wiki-memory-wiki] startup failed: ${safeStartupError(error)}`);
  } catch {
    // A logger failure must never become a second plugin startup failure.
  }
}

function createRuntime(api: OpenClawPluginApi, pluginConfig: Partial<PluginConfig>): {
  ensure: () => Promise<ToolRuntime>;
  start: () => Promise<void>;
  stop: () => void;
  status: () => Promise<unknown>;
} {
  const state: PluginRuntimeState = {};
  const ensure = async (): Promise<ToolRuntime> => {
    if (state.runtime) return state.runtime;
    state.initialization ??= (async () => {
      const { config, apiKey } = await resolveConfig(pluginConfig, hostSecretResolver(api, `${api.id ?? 'next-wiki-memory-wiki'}.config`));
      const client = new NextWikiClient({ baseUrl: config.baseUrl, apiKey });
      const runtime: ToolRuntime = {
        client,
        sync: new SyncService(config.vaultPath, client, config.syncIntervalMinutes),
      };
      state.runtime = runtime;
      return runtime;
    })().catch((error: unknown) => {
      state.startupError = safeStartupError(error);
      throw error;
    });
    return state.initialization;
  };
  const start = async (): Promise<void> => {
    const { sync } = await ensure();
    sync.start();
  };
  const stop = (): void => {
    state.runtime?.sync.stop();
  };
  const status = async (): Promise<unknown> => {
    try {
      return (await ensure()).sync.getStatus();
    } catch {
      return { state: 'degraded', scanned: 0, uploaded: 0, unchanged: 0, failed: 1, lastError: state.startupError ?? 'plugin_startup_failed' };
    }
  };
  return { ensure, start, stop, status };
}

/**
 * OpenClaw invokes plugin registration synchronously. Async work belongs in a
 * registered service (or an explicitly handled fallback), never in a detached
 * Promise from this function.
 */
export function register(api: OpenClawPluginApi): void {
  const pluginConfig = api.pluginConfig ?? api.config;
  if (!pluginConfig?.enabled) return;
  const runtime = createRuntime(api, pluginConfig);
  for (const definition of Object.values(createTools(runtime.ensure, runtime.status))) {
    api.registerTool(definition, { optional: definition.name === 'next_wiki_sync' });
  }
  api.registerSkill?.('./skills/next-wiki');
  if (api.registerService) {
    api.registerService({
      id: 'next-wiki-memory-wiki-sync',
      start: () => runtime.start().catch((error: unknown) => { reportStartupFailure(api, error); }),
      stop: runtime.stop,
    });
  } else {
    void runtime.start().catch((error: unknown) => { reportStartupFailure(api, error); });
    api.onShutdown?.(runtime.stop);
  }
}

export default definePluginEntry({ id: 'next-wiki-memory-wiki', name: 'next-wiki Memory Wiki', description: 'Mirror OpenClaw Memory Wiki into next-wiki and retrieve account knowledge.', register: (api) => register(api as unknown as OpenClawPluginApi) });
