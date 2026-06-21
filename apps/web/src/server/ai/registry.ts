import type { AiProviderKind } from '@next-wiki/shared';
import { OpenAiCompatibleAdapter } from './providers/openai-compatible';
import { OpenRouterAdapter } from './providers/openrouter';
import type { AiProviderAdapter, ProviderRuntimeConfig } from './types';

const factories: Record<AiProviderKind, (config: ProviderRuntimeConfig) => AiProviderAdapter> = {
  openai_compatible: (config) => new OpenAiCompatibleAdapter(config),
  openrouter: (config) => new OpenRouterAdapter(config),
};

export function createAiProviderAdapter(config: ProviderRuntimeConfig): AiProviderAdapter {
  return factories[config.kind](config);
}
