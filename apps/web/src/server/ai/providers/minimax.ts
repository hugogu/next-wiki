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
import { providerFetch, readBoundedJson } from './http-client';

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
        { method: 'POST', body: JSON.stringify({ model: '', prompt: '' }) },
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
        aspect_ratio: input.aspectRatio,
        response_format: 'base64',
      }),
    });
    const payload = await readBoundedJson<{ data?: { image_base64?: unknown } }>(response);
    const image = Array.isArray(payload.data?.image_base64) ? payload.data.image_base64[0] : undefined;
    if (typeof image === 'string') {
      return { kind: 'data_url', dataUrl: `data:image/jpeg;base64,${image}` };
    }
    throw new AiProviderError('INVALID_RESPONSE', 'MiniMax did not return an image');
  }
}
