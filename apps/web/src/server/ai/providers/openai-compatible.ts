import { env } from '@/server/config';
import {
  AiProviderError,
  type AiProviderAdapter,
  type DiscoveredModel,
  type EmbeddingInput,
  type EmbeddingOutput,
  type ImageGenerationInput,
  type ImageGenerationOutput,
  type ProviderHealth,
  type ProviderRuntimeConfig,
  type TextGenerationEvent,
  type TextGenerationInput,
} from '../types';
import type { AiProviderKind } from '@next-wiki/shared';
import { providerFetch, readBoundedJson } from './http-client';

export type ModelPayload = {
  id?: unknown;
  name?: unknown;
  canonical_slug?: unknown;
  context_length?: unknown;
  embedding_dimensions?: unknown;
  top_provider?: { context_length?: unknown; max_completion_tokens?: unknown };
  architecture?: { input_modalities?: unknown; output_modalities?: unknown };
  supported_parameters?: unknown;
  supports_image_in?: unknown;
  supports_audio_in?: unknown;
  supports_reasoning?: unknown;
};

export class OpenAiCompatibleAdapter implements AiProviderAdapter {
  readonly kind: AiProviderKind = 'openai_compatible';
  constructor(protected readonly config: ProviderRuntimeConfig) {}

  async testConnection(): Promise<ProviderHealth> {
    const started = Date.now();
    try {
      const response = await providerFetch(this.config, 'models', {}, env.AI_PROVIDER_CONNECT_TIMEOUT_MS);
      await response.body?.cancel();
      return { ok: true, latencyMs: Date.now() - started, providerRequestId: response.headers.get('x-request-id') ?? undefined };
    } catch (error) {
      return { ok: false, latencyMs: Date.now() - started, errorCode: error instanceof AiProviderError ? error.code : 'PROVIDER_UNAVAILABLE', errorMessage: error instanceof Error ? error.message : 'Provider unavailable' };
    }
  }

  protected mapModel(value: ModelPayload): DiscoveredModel | null {
    if (typeof value.id !== 'string' || !value.id) return null;
    const architecture = value.architecture ?? {};
    const inputModalities = Array.isArray(architecture.input_modalities)
      ? architecture.input_modalities.filter((item): item is string => typeof item === 'string')
      : [];
    const outputModalities = Array.isArray(architecture.output_modalities)
      ? architecture.output_modalities.filter((item): item is string => typeof item === 'string')
      : [];
    return {
      externalId: value.id,
      canonicalId: typeof value.canonical_slug === 'string' ? value.canonical_slug : undefined,
      displayName: typeof value.name === 'string' ? value.name : value.id,
      availability: 'available',
      contextWindow:
        typeof value.context_length === 'number'
          ? value.context_length
          : typeof value.top_provider?.context_length === 'number'
            ? value.top_provider.context_length
            : undefined,
      maxOutputTokens:
        typeof value.top_provider?.max_completion_tokens === 'number'
          ? value.top_provider.max_completion_tokens
          : undefined,
      embeddingDimensions:
        typeof value.embedding_dimensions === 'number' ? value.embedding_dimensions : undefined,
      inputModalities,
      outputModalities,
      // An OpenAI-compatible endpoint is, by definition, a /chat/completions text
      // generator. Plain providers (e.g. DeepSeek) expose no modality metadata, so
      // default text_generation on; only downgrade when modalities are present and
      // explicitly exclude text. Embedding/image remain manual.
      capabilities: [
        {
          capability: 'text_generation',
          supported: outputModalities.length === 0 || outputModalities.includes('text'),
          source: 'catalog',
        },
        {
          capability: 'vision',
          supported: inputModalities.includes('image') || value.supports_image_in === true,
          source: 'catalog',
        },
        {
          capability: 'audio',
          supported: inputModalities.includes('audio') || value.supports_audio_in === true,
          source: 'catalog',
        },
        {
          capability: 'thinking',
          supported: value.supports_reasoning === true,
          source: 'catalog',
        },
      ],
      rawMetadata: value as Record<string, unknown>,
    };
  }

  async listModels(): Promise<DiscoveredModel[]> {
    const response = await providerFetch(this.config, 'models');
    const payload = await readBoundedJson<{ data?: ModelPayload[] }>(response);
    if (!Array.isArray(payload.data)) throw new AiProviderError('INVALID_RESPONSE', 'Provider model list is invalid');
    const models = payload.data.map((item) => this.mapModel(item)).filter((item): item is DiscoveredModel => item !== null);
    const ids = new Set<string>();
    return models.filter((model) => !ids.has(model.externalId) && Boolean(ids.add(model.externalId)));
  }

  async *streamText(input: TextGenerationInput): AsyncIterable<TextGenerationEvent> {
    const response = await providerFetch(this.config, 'chat/completions', {
      method: 'POST',
      signal: input.abortSignal,
      body: JSON.stringify({
        model: input.modelExternalId,
        stream: true,
        messages: [{ role: 'system', content: input.system }, ...input.messages],
        max_tokens: input.maxOutputTokens,
        temperature: input.temperature,
      }),
    });
    const requestId = response.headers.get('x-request-id');
    if (requestId) yield { type: 'provider_request_id', id: requestId };
    if (!response.body) throw new AiProviderError('INVALID_RESPONSE', 'Provider stream is empty');
    const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
    let buffer = '';
    while (true) {
      const { done, value } = await reader.read();
      buffer += value ?? '';
      const frames = buffer.split(/\n\n/);
      buffer = frames.pop() ?? '';
      for (const frame of frames) {
        for (const line of frame.split(/\r?\n/)) {
          if (!line.startsWith('data:')) continue;
          const data = line.slice(5).trim();
          if (!data || data === '[DONE]') continue;
          let event: {
            choices?: Array<{ delta?: { content?: unknown }; finish_reason?: unknown }>;
            usage?: { prompt_tokens?: number; completion_tokens?: number };
          };
          try {
            event = JSON.parse(data);
          } catch {
            throw new AiProviderError('INVALID_RESPONSE', 'Provider returned a malformed stream');
          }
          const choice = event.choices?.[0];
          const text = choice?.delta?.content;
          if (typeof text === 'string' && text) yield { type: 'delta', text: text.slice(0, 64_000) };
          if (event.usage) yield { type: 'usage', inputTokens: event.usage.prompt_tokens, outputTokens: event.usage.completion_tokens };
          if (choice?.finish_reason) yield { type: 'done', finishReason: String(choice.finish_reason) };
        }
      }
      if (done) break;
    }
  }

  async embed(input: EmbeddingInput): Promise<EmbeddingOutput> {
    const response = await providerFetch(this.config, 'embeddings', {
      method: 'POST',
      signal: input.abortSignal,
      body: JSON.stringify({ model: input.modelExternalId, input: input.inputs }),
    });
    const payload = await readBoundedJson<{
      data?: Array<{ index?: number; embedding?: unknown }>;
      usage?: { prompt_tokens?: number };
    }>(response);
    if (!Array.isArray(payload.data) || payload.data.length !== input.inputs.length) {
      throw new AiProviderError('INVALID_RESPONSE', 'Provider returned the wrong embedding count');
    }
    const vectors = [...payload.data]
      .sort((a, b) => Number(a.index ?? 0) - Number(b.index ?? 0))
      .map((item) => item.embedding);
    for (const vector of vectors) {
      if (!Array.isArray(vector) || vector.length !== input.expectedDimensions || vector.some((value) => typeof value !== 'number' || !Number.isFinite(value))) {
        throw new AiProviderError('INVALID_RESPONSE', 'Provider returned an invalid embedding vector');
      }
    }
    return { vectors: vectors as number[][], usage: { inputTokens: payload.usage?.prompt_tokens }, providerRequestId: response.headers.get('x-request-id') ?? undefined };
  }

  async generateImage(input: ImageGenerationInput): Promise<ImageGenerationOutput> {
    const response = await providerFetch(this.config, 'images/generations', {
      method: 'POST',
      signal: input.abortSignal,
      body: JSON.stringify({ model: input.modelExternalId, prompt: input.prompt, response_format: 'b64_json' }),
    });
    const payload = await readBoundedJson<{
      data?: Array<{ b64_json?: unknown; url?: unknown }>;
    }>(response);
    const image = payload.data?.[0];
    if (typeof image?.b64_json === 'string') return { kind: 'data_url', dataUrl: `data:image/png;base64,${image.b64_json}` };
    if (typeof image?.url === 'string') return { kind: 'url', url: image.url };
    throw new AiProviderError('INVALID_RESPONSE', 'Provider did not return an image');
  }
}
