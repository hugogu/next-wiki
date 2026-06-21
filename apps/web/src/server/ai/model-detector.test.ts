import { clearDetectorCache, listEmbeddingModels } from './model-detector';

describe('OpenRouter embedding model detection', () => {
  afterEach(() => {
    clearDetectorCache();
    vi.unstubAllGlobals();
  });

  it('lists embedding models and infers explicit multilingual support', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      data: [
        {
          id: 'openai/text-embedding-3-small',
          name: 'Text Embedding 3 Small',
          description: 'A multilingual embedding model for search.',
          context_length: 8192,
          architecture: {
            input_modalities: ['text'],
            output_modalities: ['embeddings'],
          },
        },
        {
          id: 'openai/chat-model',
          name: 'Chat Model',
          architecture: {
            input_modalities: ['text'],
            output_modalities: ['text'],
          },
        },
      ],
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const models = await listEmbeddingModels('openai', 'detector-key');

    expect(fetchMock).toHaveBeenCalledWith(
      'https://openrouter.ai/api/v1/embeddings/models',
      expect.objectContaining({
        headers: { Authorization: 'Bearer detector-key' },
      }),
    );
    expect(models).toEqual([
      expect.objectContaining({
        externalId: 'text-embedding-3-small',
        contextWindow: 8192,
        multilingualSupport: true,
        outputModalities: ['embeddings'],
      }),
    ]);
  });

  it('keeps full model identifiers for an OpenRouter capability', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      data: [{
        id: 'vendor/embedding-model',
        name: 'Embedding Model',
        description: 'Embedding model for retrieval.',
        architecture: {
          input_modalities: ['text'],
          output_modalities: ['embeddings'],
        },
      }],
    }), { status: 200 })));

    await expect(listEmbeddingModels('openrouter', 'provider-key')).resolves.toEqual([
      expect.objectContaining({
        externalId: 'vendor/embedding-model',
        multilingualSupport: null,
      }),
    ]);
  });
});
