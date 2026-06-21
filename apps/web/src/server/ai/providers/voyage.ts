import {
  unsupportedProviderOperation,
  type DiscoveredModel,
  type ImageGenerationInput,
  type ImageGenerationOutput,
  type ProviderRuntimeConfig,
  type TextGenerationEvent,
  type TextGenerationInput,
} from '../types';
import { OpenAiCompatibleAdapter } from './openai-compatible';

export class VoyageAdapter extends OpenAiCompatibleAdapter {
  override readonly kind = 'voyage' as const;

  constructor(config: ProviderRuntimeConfig) {
    super(config);
  }

  override async listModels(): Promise<DiscoveredModel[]> {
    return [];
  }

  override async *streamText(_input: TextGenerationInput): AsyncIterable<TextGenerationEvent> {
    unsupportedProviderOperation('chat generation');
  }

  override async generateImage(_input: ImageGenerationInput): Promise<ImageGenerationOutput> {
    return unsupportedProviderOperation('image generation');
  }
}
