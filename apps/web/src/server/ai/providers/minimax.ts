import {
  AiProviderError,
  unsupportedProviderOperation,
  type DiscoveredModel,
  type EmbeddingInput,
  type EmbeddingOutput,
  type ImageGenerationInput,
  type ImageGenerationOutput,
  type ProviderRuntimeConfig,
  type TextGenerationEvent,
  type TextGenerationInput,
} from '../types';
import { OpenAiCompatibleAdapter } from './openai-compatible';
import { providerFetch, readBoundedJson } from './http-client';

export class MiniMaxAdapter extends OpenAiCompatibleAdapter {
  override readonly kind = 'minimax' as const;

  constructor(config: ProviderRuntimeConfig) {
    super(config);
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
