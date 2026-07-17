import { afterEach, describe, expect, it, vi } from 'vitest';
import { OpenRouterDetector, clearDetectorCache } from './openrouter';
import { detectorRuntime, stubFetch } from './test-helpers';

async function run(detector: OpenRouterDetector) {
  return detector.listModels({ abortSignal: new AbortController().signal });
}

describe('OpenRouter detector contract', () => {
  afterEach(() => {
    clearDetectorCache();
    vi.unstubAllGlobals();
  });

  it('filters to the configured namespace and strips the prefix from external ids', async () => {
    stubFetch(() => ({
      body: {
        data: [
          {
            id: 'openai/gpt-4o',
            name: 'GPT-4o',
            architecture: { input_modalities: ['text', 'image'], output_modalities: ['text'] },
            supported_parameters: ['reasoning'],
            context_length: 128_000,
            top_provider: { max_completion_tokens: 16_384 },
          },
          { id: 'anthropic/claude', name: 'Claude', architecture: { output_modalities: ['text'] } },
        ],
      },
    }));

    const result = await run(new OpenRouterDetector(detectorRuntime({ source: 'openrouter', namespace: 'openai', credentials: { apiKey: 'k' } })));
    expect(result.models).toHaveLength(1);
    const model = result.models[0]!;
    expect(model.externalId).toBe('gpt-4o');
    expect(model.contextWindow).toBe(128_000);
    expect(model.maxOutputTokens).toBe(16_384);
    expect(model.capabilities.map((c) => c.capability).sort()).toEqual(['text_generation', 'thinking', 'vision']);
    for (const capability of model.capabilities) {
      expect(capability.details).toMatchObject({ detector: 'openrouter', evidence: 'catalog' });
    }
  });

  it('maps embedding output modality to the embedding capability', async () => {
    stubFetch(() => ({
      body: {
        data: [
          {
            id: 'openai/text-embedding-3-small',
            name: 'Text Embedding 3 Small',
            architecture: { input_modalities: ['text'], output_modalities: ['embeddings'] },
            embedding_dimensions: 1536,
          },
        ],
      },
    }));

    const result = await run(new OpenRouterDetector(detectorRuntime({ source: 'openrouter', namespace: 'openai', credentials: { apiKey: 'k' } })));
    const model = result.models[0]!;
    expect(model.embeddingDimensions).toBe(1536);
    expect(model.capabilities.map((c) => c.capability)).toContain('embedding');
  });

  it('rejects when no API key is configured', async () => {
    await expect(
      run(new OpenRouterDetector(detectorRuntime({ source: 'openrouter', credentials: {} }))),
    ).rejects.toMatchObject({ code: 'AUTHENTICATION_FAILED' });
  });
});
