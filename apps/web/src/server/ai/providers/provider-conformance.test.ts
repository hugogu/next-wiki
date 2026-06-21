import { startAiProviderFixture } from '../../../../test/ai-provider-fixture';
import { OpenAiCompatibleAdapter } from './openai-compatible';
import { AiProviderError, type ProviderRuntimeConfig } from '../types';

function config(baseUrl: string): ProviderRuntimeConfig {
  return {
    providerId: '00000000-0000-4000-8000-000000000001',
    name: 'Fixture',
    kind: 'openai_compatible',
    baseUrl,
    config: {},
    credentials: { apiKey: 'test-key' },
  };
}

describe('OpenAI-compatible provider adapter', () => {
  it('normalizes models, SSE text, embeddings, and image responses', async () => {
    const fixture = await startAiProviderFixture({ embeddingDimensions: 3 });
    try {
      const adapter = new OpenAiCompatibleAdapter(config(fixture.baseUrl));
      expect((await adapter.testConnection()).ok).toBe(true);
      expect((await adapter.listModels()).map((model) => model.externalId)).toContain('fixture/text');
      const controller = new AbortController();
      const text: string[] = [];
      for await (const event of adapter.streamText({
        actionId: 'action',
        modelExternalId: 'fixture/text',
        system: 'system',
        messages: [{ role: 'user', content: 'question' }],
        abortSignal: controller.signal,
      })) {
        if (event.type === 'delta') text.push(event.text);
      }
      expect(text.join('')).toBe('fixture answer');
      expect((await adapter.embed({
        actionId: 'action',
        modelExternalId: 'fixture/embed',
        inputs: ['one', 'two'],
        expectedDimensions: 3,
        abortSignal: controller.signal,
      })).vectors).toHaveLength(2);
      expect((await adapter.generateImage({
        actionId: 'action',
        modelExternalId: 'fixture/image',
        prompt: 'image',
        abortSignal: controller.signal,
      })).kind).toBe('data_url');
      expect(JSON.stringify(fixture.requests)).not.toContain('test-key');
    } finally {
      await fixture.close();
    }
  });

  it('rejects malformed vectors and streams with normalized errors', async () => {
    const fixture = await startAiProviderFixture({ embeddingDimensions: 3, malformed: true });
    try {
      const adapter = new OpenAiCompatibleAdapter(config(fixture.baseUrl));
      await expect(adapter.embed({
        actionId: 'action',
        modelExternalId: 'fixture/embed',
        inputs: ['one'],
        expectedDimensions: 3,
        abortSignal: new AbortController().signal,
      })).rejects.toBeInstanceOf(AiProviderError);
      await expect(async () => {
        for await (const event of adapter.streamText({
          actionId: 'action',
          modelExternalId: 'fixture/text',
          system: 'system',
          messages: [{ role: 'user', content: 'question' }],
          abortSignal: new AbortController().signal,
        })) {
          void event;
        }
      }).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
    } finally {
      await fixture.close();
    }
  });
});
