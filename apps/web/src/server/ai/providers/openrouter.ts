import type { DiscoveredModel, ImageGenerationInput, ImageGenerationOutput, ProviderRuntimeConfig } from '../types';
import { AiProviderError } from '../types';
import { providerFetch, readBoundedJson } from './http-client';
import { OpenAiCompatibleAdapter } from './openai-compatible';
import type { ModelPayload } from './openai-compatible';

export class OpenRouterAdapter extends OpenAiCompatibleAdapter {
  override readonly kind = 'openrouter' as const;
  constructor(config: ProviderRuntimeConfig) {
    super(config);
  }

  protected override mapModel(value: ModelPayload): DiscoveredModel | null {
    const model = super.mapModel(value);
    if (!model) return null;
    const output = new Set(model.outputModalities);
    const input = new Set(model.inputModalities);
    const parameters = Array.isArray(value.supported_parameters)
      ? value.supported_parameters.filter((item): item is string => typeof item === 'string')
      : [];
    model.capabilities = [
      { capability: 'text_generation', supported: output.has('text'), source: 'catalog' },
      { capability: 'embedding', supported: output.has('embeddings'), source: 'catalog' },
      { capability: 'image_generation', supported: output.has('image'), source: 'catalog' },
      { capability: 'vision', supported: input.has('image'), source: 'catalog' },
      { capability: 'audio', supported: input.has('audio'), source: 'catalog' },
      {
        capability: 'thinking',
        supported: parameters.some((parameter) =>
          ['reasoning', 'include_reasoning', 'reasoning_effort'].includes(parameter),
        ),
        source: 'catalog',
      },
    ];
    return model;
  }

  override async generateImage(input: ImageGenerationInput): Promise<ImageGenerationOutput> {
    const response = await providerFetch(this.config, 'chat/completions', {
      method: 'POST',
      signal: input.abortSignal,
      body: JSON.stringify({
        model: input.modelExternalId,
        messages: [{ role: 'user', content: input.prompt }],
        modalities: ['image', 'text'],
        image_config: input.aspectRatio ? { aspect_ratio: input.aspectRatio } : undefined,
        stream: false,
      }),
    });
    const payload = await readBoundedJson<{
      choices?: Array<{ message?: { images?: Array<{ image_url?: { url?: unknown } }> } }>;
    }>(response);
    const url = payload.choices?.[0]?.message?.images?.[0]?.image_url?.url;
    if (typeof url === 'string' && url.startsWith('data:')) return { kind: 'data_url', dataUrl: url };
    if (typeof url === 'string') return { kind: 'url', url };
    throw new AiProviderError('INVALID_RESPONSE', 'OpenRouter did not return an image');
  }
}
