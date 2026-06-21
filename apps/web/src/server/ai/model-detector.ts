import { getAiProviderVendor, type AiCapability, type AiProviderVendor } from '@next-wiki/shared';

export type DetectedCapabilities = {
  capabilities: Array<{ capability: AiCapability; supported: boolean; source: 'provider' }>;
  contextWindow?: number;
  maxOutputTokens?: number;
  canonicalId?: string;
  outputModalities: string[];
};

type OpenRouterModel = {
  id: string;
  canonical_slug?: string;
  context_length?: number;
  architecture?: { input_modalities?: string[]; output_modalities?: string[] };
  top_provider?: { context_length?: number; max_completion_tokens?: number };
  supported_parameters?: string[];
};

let cache: { at: number; models: Map<string, OpenRouterModel> } | null = null;
const TTL_MS = 60 * 60 * 1000;

async function loadModels(apiKey: string): Promise<Map<string, OpenRouterModel>> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.models;
  const response = await fetch('https://openrouter.ai/api/v1/models', {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`OpenRouter responded ${response.status}`);
  const payload = (await response.json()) as { data?: OpenRouterModel[] };
  const models = new Map<string, OpenRouterModel>();
  for (const model of payload.data ?? []) models.set(model.id, model);
  cache = { at: Date.now(), models };
  return models;
}

export async function detectCapabilities(
  externalId: string,
  vendor: AiProviderVendor,
  apiKey: string,
): Promise<DetectedCapabilities | null> {
  const ns = getAiProviderVendor(vendor).openrouterNamespace;
  if (!ns) return null;
  const models = await loadModels(apiKey);
  const entry = models.get(`${ns}/${externalId}`);
  if (!entry) return null;
  const input = entry.architecture?.input_modalities ?? [];
  const output = entry.architecture?.output_modalities ?? [];
  const params = entry.supported_parameters ?? [];
  const capabilities: DetectedCapabilities['capabilities'] = [
    { capability: 'text_generation', supported: output.includes('text') || output.length === 0, source: 'provider' },
    { capability: 'vision', supported: input.includes('image'), source: 'provider' },
    { capability: 'audio', supported: input.includes('audio'), source: 'provider' },
    { capability: 'thinking', supported: params.includes('reasoning') || params.includes('include_reasoning'), source: 'provider' },
  ];
  return {
    capabilities,
    contextWindow: entry.top_provider?.context_length ?? entry.context_length,
    maxOutputTokens: entry.top_provider?.max_completion_tokens,
    canonicalId: entry.canonical_slug,
    outputModalities: output,
  };
}

export function clearDetectorCache(): void {
  cache = null;
}
