import { env } from '@/server/config';
import {
  AiProviderError,
  unsupportedProviderOperation,
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
import { OpenAiCompatibleAdapter } from './openai-compatible';
import { describeAuth, providerFetch, readBoundedJson } from './http-client';

// MiniMax authentication failures, returned inside base_resp on an HTTP 200.
const MINIMAX_AUTH_STATUS = new Set([1004, 2049]);

export class MiniMaxAdapter extends OpenAiCompatibleAdapter {
  override readonly kind = 'minimax' as const;

  constructor(config: ProviderRuntimeConfig) {
    super(config);
  }

  // MiniMax exposes no model-listing or health endpoint, so the generic
  // GET /models probe always fails. Validate credentials against the real
  // image endpoint instead: it answers with HTTP 200 and a base_resp.status_code
  // where 1004/2049 mean the key was rejected and anything else (including
  // invalid-parameter errors) means the key was accepted.
  override async testConnection(): Promise<ProviderHealth> {
    const started = Date.now();
    try {
      const response = await providerFetch(
        this.config,
        'image_generation',
        { method: 'POST', body: JSON.stringify({ model: 'image-01', prompt: '' }) },
        env.AI_PROVIDER_CONNECT_TIMEOUT_MS,
      );
      const payload = await readBoundedJson<{ base_resp?: { status_code?: number; status_msg?: string } }>(response);
      const status = payload.base_resp?.status_code;
      if (status !== undefined && MINIMAX_AUTH_STATUS.has(status)) {
        return {
          ok: false,
          latencyMs: Date.now() - started,
          errorCode: 'PROVIDER_UNAVAILABLE',
          errorMessage: payload.base_resp?.status_msg ?? 'MiniMax rejected the credentials',
          detail: {
            request: { method: 'POST', url: `${this.config.baseUrl}/image_generation`, auth: describeAuth(this.config) },
            response: { status: 200, base_resp: payload.base_resp },
          },
        };
      }
      return {
        ok: true,
        latencyMs: Date.now() - started,
        providerRequestId: response.headers.get('x-request-id') ?? undefined,
      };
    } catch (error) {
      return {
        ok: false,
        latencyMs: Date.now() - started,
        errorCode: error instanceof AiProviderError ? error.code : 'PROVIDER_UNAVAILABLE',
        errorMessage: error instanceof Error ? error.message : 'Provider unavailable',
        detail: error instanceof AiProviderError ? error.detail : undefined,
      };
    }
  }

  override async listModels(): Promise<DiscoveredModel[]> {
    return [];
  }

  override async *streamText(_input: TextGenerationInput): AsyncIterable<TextGenerationEvent> {
    unsupportedProviderOperation('chat generation');
  }

  override async embed(_input: EmbeddingInput): Promise<EmbeddingOutput> {
    return unsupportedProviderOperation('embeddings');
  }

  override async generateImage(input: ImageGenerationInput): Promise<ImageGenerationOutput> {
    const response = await providerFetch(this.config, 'image_generation', {
      method: 'POST',
      signal: input.abortSignal,
      body: JSON.stringify({
        model: input.modelExternalId,
        prompt: input.prompt,
        ...(input.aspectRatio ? { aspect_ratio: input.aspectRatio } : {}),
        response_format: 'base64',
        n: 1,
      }),
    });
    // MiniMax answers with HTTP 200 even on failure; the real outcome is in
    // base_resp.status_code (0 = success), so surface its message instead of a
    // generic "no image" error.
    const payload = await readBoundedJson<{
      data?: { image_base64?: unknown; image_urls?: unknown };
      base_resp?: { status_code?: number; status_msg?: string };
    }>(response);
    const status = payload.base_resp?.status_code;
    if (status !== undefined && status !== 0) {
      throw new AiProviderError(
        MINIMAX_AUTH_STATUS.has(status)
          ? 'PROVIDER_UNAVAILABLE'
          : status === 1002
            ? 'RATE_LIMITED'
            : status === 1026
              ? 'CONTENT_REJECTED'
              : 'INVALID_RESPONSE',
        `MiniMax image generation failed (${status}): ${payload.base_resp?.status_msg ?? 'unknown error'}`,
      );
    }
    const base64 = Array.isArray(payload.data?.image_base64) ? payload.data.image_base64[0] : undefined;
    if (typeof base64 === 'string' && base64) {
      return { kind: 'data_url', dataUrl: `data:image/jpeg;base64,${base64}` };
    }
    const url = Array.isArray(payload.data?.image_urls) ? payload.data.image_urls[0] : undefined;
    if (typeof url === 'string' && url) {
      return { kind: 'url', url };
    }
    throw new AiProviderError('INVALID_RESPONSE', 'MiniMax did not return an image');
  }
}
