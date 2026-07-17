import { getAiProviderVendor, type AiCapability, type AiProviderVendor } from '@next-wiki/shared';
import type {
  DetectedCapability,
  DetectedModel,
  DetectorListInput,
  DetectorListResult,
  DetectorRuntimeConfig,
  ModelCapabilityDetector,
} from './types';
import { DetectorError, detectorCodeForStatus } from './types';

export type DetectedCapabilities = {
  capabilities: Array<{ capability: AiCapability; supported: boolean; source: 'provider' }>;
  contextWindow?: number;
  maxOutputTokens?: number;
  canonicalId?: string;
  outputModalities: string[];
};

type OpenRouterModel = {
  id: string;
  name?: string;
  description?: string;
  canonical_slug?: string;
  context_length?: number;
  embedding_dimensions?: number;
  architecture?: { input_modalities?: string[]; output_modalities?: string[] };
  top_provider?: { context_length?: number; max_completion_tokens?: number };
  supported_parameters?: string[];
};

export type DetectedEmbeddingModel = {
  externalId: string;
  canonicalId?: string;
  displayName: string;
  contextWindow?: number;
  embeddingDimensions?: number;
  multilingualSupport: boolean | null;
  inputModalities: string[];
  outputModalities: string[];
  rawMetadata: Record<string, unknown>;
};

function detectMultilingualSupport(description?: string): boolean | null {
  if (!description) return null;
  return /\bmultilingual\b|\bmultiple languages\b|\bcross-lingual\b|\b\d+\+ languages\b/i.test(description)
    ? true
    : null;
}

let cache: { at: number; models: Map<string, OpenRouterModel> } | null = null;
let embeddingCache: { at: number; models: OpenRouterModel[] } | null = null;
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

async function loadEmbeddingModels(apiKey: string): Promise<OpenRouterModel[]> {
  if (embeddingCache && Date.now() - embeddingCache.at < TTL_MS) return embeddingCache.models;
  const response = await fetch('https://openrouter.ai/api/v1/embeddings/models', {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`OpenRouter responded ${response.status}`);
  const payload = (await response.json()) as { data?: OpenRouterModel[] };
  const models = payload.data ?? [];
  embeddingCache = { at: Date.now(), models };
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

export async function listEmbeddingModels(
  vendor: AiProviderVendor,
  apiKey: string,
): Promise<DetectedEmbeddingModel[]> {
  const namespace = getAiProviderVendor(vendor).openrouterNamespace;
  if (vendor !== 'openrouter' && !namespace) return [];
  const models = await loadEmbeddingModels(apiKey);
  const prefix = namespace ? `${namespace}/` : '';
  return models.flatMap((model) => {
    if (vendor !== 'openrouter' && !model.id.startsWith(prefix)) return [];
    const architecture = model.architecture ?? {};
    const outputModalities = architecture.output_modalities ?? [];
    if (!outputModalities.includes('embeddings')) return [];
    return [{
      externalId: vendor === 'openrouter' ? model.id : model.id.slice(prefix.length),
      canonicalId: model.canonical_slug,
      displayName: model.name ?? model.id,
      contextWindow: model.top_provider?.context_length ?? model.context_length,
      embeddingDimensions: model.embedding_dimensions,
      multilingualSupport: detectMultilingualSupport(model.description),
      inputModalities: architecture.input_modalities ?? [],
      outputModalities,
      rawMetadata: model as unknown as Record<string, unknown>,
    }];
  });
}

export function clearDetectorCache(): void {
  cache = null;
  embeddingCache = null;
}

/** Map one OpenRouter model payload into a normalized {@link DetectedModel}. */
function toDetectedModel(externalId: string, model: OpenRouterModel): DetectedModel {
  const input = model.architecture?.input_modalities ?? [];
  const output = model.architecture?.output_modalities ?? [];
  const params = model.supported_parameters ?? [];
  const capabilities: DetectedCapability[] = [];
  const push = (capability: AiCapability, supported: boolean) => {
    if (supported) {
      capabilities.push({
        capability,
        supported: true,
        source: 'provider',
        details: { detector: 'openrouter', evidence: 'catalog' },
      });
    }
  };
  push('text_generation', output.includes('text'));
  push('embedding', output.includes('embeddings'));
  push('image_generation', output.includes('image'));
  push('vision', input.includes('image'));
  push('audio', input.includes('audio'));
  push('thinking', params.includes('reasoning') || params.includes('include_reasoning'));
  return {
    externalId,
    canonicalId: model.canonical_slug,
    displayName: model.name ?? externalId,
    availability: 'available',
    contextWindow: model.top_provider?.context_length ?? model.context_length,
    maxOutputTokens: model.top_provider?.max_completion_tokens,
    embeddingDimensions: model.embedding_dimensions,
    inputModalities: input,
    outputModalities: output,
    capabilities,
    rawMetadata: {
      ...(model as unknown as Record<string, unknown>),
      detector: { source: 'openrouter', evidence: 'catalog' },
    },
  };
}

/**
 * OpenRouter detector behind the shared contract. It lists the OpenRouter model
 * catalog for the configured namespace and normalizes catalog evidence into the
 * shared capability vocabulary. Provider inference is handled separately by the
 * runtime provider adapter — this detector only produces metadata.
 */
export class OpenRouterDetector implements ModelCapabilityDetector {
  readonly source = 'openrouter' as const;

  constructor(private readonly config: DetectorRuntimeConfig) {}

  async listModels(_input: DetectorListInput): Promise<DetectorListResult> {
    const apiKey = this.config.credentials.apiKey;
    if (!apiKey) {
      throw new DetectorError('AUTHENTICATION_FAILED', 'OpenRouter detector requires an API key');
    }
    const namespace = this.config.namespace;
    let catalog: Map<string, OpenRouterModel>;
    try {
      catalog = await loadModels(apiKey);
    } catch (error) {
      const status = Number((error as Error).message?.match(/responded (\d+)/)?.[1]);
      if (Number.isFinite(status)) {
        throw new DetectorError(detectorCodeForStatus(status), `OpenRouter responded ${status}`);
      }
      throw error;
    }
    const prefix = namespace ? `${namespace}/` : '';
    const models: DetectedModel[] = [];
    for (const [id, model] of catalog) {
      if (prefix && !id.startsWith(prefix)) continue;
      const externalId = namespace ? id.slice(prefix.length) : id;
      models.push(toDetectedModel(externalId, model));
    }
    return {
      models,
      freshness: 'fresh',
      counts: {},
      warnings: [],
    };
  }
}
