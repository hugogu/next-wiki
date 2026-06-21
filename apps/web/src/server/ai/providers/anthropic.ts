import { env } from '@/server/config';
import {
  AiProviderError,
  unsupportedProviderOperation,
  type AiProviderAdapter,
  type DiscoveredModel,
  type EmbeddingInput,
  type EmbeddingOutput,
  type ImageGenerationInput,
  type ImageGenerationOutput,
  type ProviderRuntimeConfig,
  type TextGenerationEvent,
  type TextGenerationInput,
} from '../types';
import { providerFetch, readBoundedJson } from './http-client';

type AnthropicModel = {
  id?: unknown;
  display_name?: unknown;
  created_at?: unknown;
  type?: unknown;
};

export class AnthropicAdapter implements AiProviderAdapter {
  readonly kind = 'anthropic' as const;

  constructor(private readonly config: ProviderRuntimeConfig) {}

  async testConnection() {
    const started = Date.now();
    try {
      const response = await providerFetch(this.config, 'models', {}, env.AI_PROVIDER_CONNECT_TIMEOUT_MS);
      await response.body?.cancel();
      return {
        ok: true,
        latencyMs: Date.now() - started,
        providerRequestId: response.headers.get('request-id') ?? undefined,
      };
    } catch (error) {
      return {
        ok: false,
        latencyMs: Date.now() - started,
        errorCode: error instanceof AiProviderError ? error.code : 'PROVIDER_UNAVAILABLE',
        errorMessage: error instanceof Error ? error.message : 'Provider unavailable',
      };
    }
  }

  async listModels(): Promise<DiscoveredModel[]> {
    const response = await providerFetch(this.config, 'models');
    const payload = await readBoundedJson<{ data?: AnthropicModel[] }>(response);
    if (!Array.isArray(payload.data)) {
      throw new AiProviderError('INVALID_RESPONSE', 'Anthropic model list is invalid');
    }
    return payload.data.flatMap((value) => {
      if (typeof value.id !== 'string' || !value.id) return [];
      return [{
        externalId: value.id,
        displayName: typeof value.display_name === 'string' ? value.display_name : value.id,
        availability: 'available' as const,
        inputModalities: ['text'],
        outputModalities: ['text'],
        capabilities: [
          { capability: 'text_generation' as const, supported: true, source: 'provider' as const },
        ],
        rawMetadata: value as Record<string, unknown>,
      }];
    });
  }

  async *streamText(input: TextGenerationInput): AsyncIterable<TextGenerationEvent> {
    const response = await providerFetch(this.config, 'messages', {
      method: 'POST',
      signal: input.abortSignal,
      body: JSON.stringify({
        model: input.modelExternalId,
        system: input.system,
        messages: input.messages,
        max_tokens: input.maxOutputTokens ?? 4096,
        temperature: input.temperature,
        stream: true,
      }),
    });
    const requestId = response.headers.get('request-id');
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
          if (!data) continue;
          let event: {
            type?: string;
            delta?: { type?: string; text?: unknown; stop_reason?: unknown };
            usage?: { input_tokens?: number; output_tokens?: number };
          };
          try {
            event = JSON.parse(data);
          } catch {
            throw new AiProviderError('INVALID_RESPONSE', 'Provider returned a malformed stream');
          }
          if (event.type === 'content_block_delta' && typeof event.delta?.text === 'string') {
            yield { type: 'delta', text: event.delta.text.slice(0, 64_000) };
          }
          if (event.usage) {
            yield {
              type: 'usage',
              inputTokens: event.usage.input_tokens,
              outputTokens: event.usage.output_tokens,
            };
          }
          if (event.type === 'message_delta' && event.delta?.stop_reason) {
            yield { type: 'done', finishReason: String(event.delta.stop_reason) };
          }
        }
      }
      if (done) break;
    }
  }

  async embed(_input: EmbeddingInput): Promise<EmbeddingOutput> {
    return unsupportedProviderOperation('embeddings');
  }

  async generateImage(_input: ImageGenerationInput): Promise<ImageGenerationOutput> {
    return unsupportedProviderOperation('image generation');
  }
}
