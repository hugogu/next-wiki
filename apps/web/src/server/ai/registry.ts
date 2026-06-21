import { getAiProviderVendor, type AiProviderKind } from '@next-wiki/shared';
import { OpenAiCompatibleAdapter } from './providers/openai-compatible';
import { OpenRouterAdapter } from './providers/openrouter';
import { AnthropicAdapter } from './providers/anthropic';
import { VoyageAdapter } from './providers/voyage';
import { MiniMaxAdapter } from './providers/minimax';
import type { AiProviderAdapter, ProviderRuntimeConfig } from './types';

const factories: Record<AiProviderKind, (config: ProviderRuntimeConfig) => AiProviderAdapter> = {
  openai_compatible: (config) => new OpenAiCompatibleAdapter(config),
  openrouter: (config) => new OpenRouterAdapter(config),
  anthropic: (config) => new AnthropicAdapter(config),
  voyage: (config) => new VoyageAdapter(config),
  minimax: (config) => new MiniMaxAdapter(config),
};

export function createAiProviderAdapter(config: ProviderRuntimeConfig): AiProviderAdapter {
  return factories[config.kind](config);
}

export function createModelDiscoveryAdapter(config: ProviderRuntimeConfig): AiProviderAdapter | null {
  const discovery = getAiProviderVendor(config.vendor).modelDiscovery;
  if (discovery === 'none') return null;
  if (discovery === 'openrouter') return new OpenRouterAdapter(config);
  if (discovery === 'anthropic') return new AnthropicAdapter(config);
  return new OpenAiCompatibleAdapter(config);
}
