import { lstat, realpath } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

export type PluginConfig = {
  baseUrl: string;
  apiKeyRef: SecretInput;
  vaultPath: string;
  /** Optional override for the active OpenClaw memory-core directory. */
  memoryPath?: string;
  syncIntervalMinutes: number;
  enabled: boolean;
};

export type SecretInput = string | { source: 'env' | 'file' | 'exec'; provider: string; id: string };
export type SecretResolver = (ref: SecretInput) => Promise<string>;

type HostConfig = { agents?: { defaults?: { workspace?: unknown } } };

function expandPath(value: string): string {
  if (value === '~') return homedir();
  if (value.startsWith('~/')) return join(homedir(), value.slice(2));
  return value;
}

export function defaultWorkspacePath(hostConfig?: unknown): string {
  const configured = (hostConfig as HostConfig | undefined)?.agents?.defaults?.workspace;
  if (typeof configured === 'string' && configured.trim()) return expandPath(configured);
  const environment = process.env.OPENCLAW_WORKSPACE_DIR;
  if (environment?.trim()) return expandPath(environment);
  const profile = process.env.OPENCLAW_PROFILE;
  return join(homedir(), '.openclaw', profile && profile !== 'default' ? `workspace-${profile}` : 'workspace');
}

export async function resolveConfig(
  input: Partial<PluginConfig>,
  resolveSecret: SecretResolver,
  workspacePath = defaultWorkspacePath(),
): Promise<{ config: PluginConfig; apiKey: string }> {
  let url: URL | undefined;
  try { url = input.baseUrl ? new URL(input.baseUrl) : undefined; } catch { /* handled below */ }
  const loopback = url?.protocol === 'http:' && (url.hostname === 'localhost' || url.hostname === '127.0.0.1');
  if (!url?.hostname || (url.protocol !== 'https:' && !loopback)) {
    throw new Error('baseUrl must use HTTPS or loopback HTTP');
  }
  if (!input.apiKeyRef) throw new Error('API key SecretRef is required');
  if (!input.vaultPath) throw new Error('vaultPath is required');
  let vaultPath: string;
  try {
    const configuredVaultPath = expandPath(input.vaultPath);
    vaultPath = await realpath(configuredVaultPath);
    if (!(await lstat(vaultPath)).isDirectory()) throw new Error('not_directory');
  } catch {
    throw new Error('vaultPath must point to an existing directory');
  }
  const syncIntervalMinutes = input.syncIntervalMinutes ?? 5;
  if (!Number.isInteger(syncIntervalMinutes) || syncIntervalMinutes < 1 || syncIntervalMinutes > 1440) throw new Error('syncIntervalMinutes must be between 1 and 1440');
  const apiKey = await resolveSecret(input.apiKeyRef);
  if (!apiKey) throw new Error('API key SecretRef resolved to an empty value');
  // Tolerate a copied API base: the client already prefixes every request path
  // with /api/v1, so a configured baseUrl carrying that suffix would double it.
  const baseUrl = input.baseUrl!.replace(/\/api(?:\/v\d+)?\/?$/u, '').replace(/\/$/u, '');
  const memoryPath = expandPath(input.memoryPath ?? join(workspacePath, 'memory'));
  return { config: { baseUrl, apiKeyRef: input.apiKeyRef, vaultPath, memoryPath, syncIntervalMinutes, enabled: input.enabled ?? true }, apiKey };
}

export function redactConfig(config: PluginConfig): Omit<PluginConfig, 'apiKeyRef'> & { apiKeyRef: '[secret]' } {
  return { ...config, apiKeyRef: '[secret]' };
}
