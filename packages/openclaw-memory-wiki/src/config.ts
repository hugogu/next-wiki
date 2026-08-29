import { lstat, realpath } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

export type PluginConfig = {
  baseUrl: string;
  mirrorApiKeyRef: SecretInput;
  knowledgeApiKeyRef: SecretInput;
  vaultPath: string;
  syncIntervalMinutes: number;
  enabled: boolean;
};

export type SecretInput = string | { source: 'env' | 'file' | 'exec'; provider: string; id: string };
export type SecretResolver = (ref: SecretInput) => Promise<string>;

export async function resolveConfig(input: Partial<PluginConfig>, resolveSecret: SecretResolver): Promise<{ config: PluginConfig; mirrorKey: string; knowledgeKey: string }> {
  let url: URL | undefined;
  try { url = input.baseUrl ? new URL(input.baseUrl) : undefined; } catch { /* handled below */ }
  const loopback = url?.protocol === 'http:' && (url.hostname === 'localhost' || url.hostname === '127.0.0.1');
  if (!url?.hostname || (url.protocol !== 'https:' && !loopback)) {
    throw new Error('baseUrl must use HTTPS or loopback HTTP');
  }
  if (!input.mirrorApiKeyRef || !input.knowledgeApiKeyRef) throw new Error('Both API key SecretRefs are required');
  if (!input.vaultPath) throw new Error('vaultPath is required');
  let vaultPath: string;
  try {
    const configuredVaultPath = input.vaultPath === '~' ? homedir() : input.vaultPath.startsWith('~/') ? join(homedir(), input.vaultPath.slice(2)) : input.vaultPath;
    vaultPath = await realpath(configuredVaultPath);
    if (!(await lstat(vaultPath)).isDirectory()) throw new Error('not_directory');
  } catch {
    throw new Error('vaultPath must point to an existing directory');
  }
  const syncIntervalMinutes = input.syncIntervalMinutes ?? 5;
  if (!Number.isInteger(syncIntervalMinutes) || syncIntervalMinutes < 1 || syncIntervalMinutes > 1440) throw new Error('syncIntervalMinutes must be between 1 and 1440');
  const [mirrorKey, knowledgeKey] = await Promise.all([resolveSecret(input.mirrorApiKeyRef), resolveSecret(input.knowledgeApiKeyRef)]);
  if (!mirrorKey || !knowledgeKey) throw new Error('API key SecretRefs resolved to empty values');
  return { config: { baseUrl: input.baseUrl!.replace(/\/$/u, ''), mirrorApiKeyRef: input.mirrorApiKeyRef, knowledgeApiKeyRef: input.knowledgeApiKeyRef, vaultPath, syncIntervalMinutes, enabled: input.enabled ?? true }, mirrorKey, knowledgeKey };
}

export function redactConfig(config: PluginConfig): Omit<PluginConfig, 'mirrorApiKeyRef' | 'knowledgeApiKeyRef'> & { mirrorApiKeyRef: '[secret]'; knowledgeApiKeyRef: '[secret]' } {
  return { ...config, mirrorApiKeyRef: '[secret]', knowledgeApiKeyRef: '[secret]' };
}
