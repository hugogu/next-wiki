import type { NeutralToolCall, NeutralToolDefinition } from '@next-wiki/shared';
import { startAiProviderFixture } from '../../../../test/ai-provider-fixture';
import { OpenAiCompatibleAdapter } from './openai-compatible';
import { AnthropicAdapter } from './anthropic';
import { VoyageAdapter } from './voyage';
import {
  AiProviderError,
  isNativeToolUnsupportedError,
  type AiProviderAdapter,
  type ProviderRuntimeConfig,
  type TextGenerationEvent,
} from '../types';

function config(baseUrl: string, vendor: ProviderRuntimeConfig['vendor'] = 'custom'): ProviderRuntimeConfig {
  return {
    providerId: '00000000-0000-4000-8000-000000000001',
    name: 'Fixture',
    type: 'chat',
    vendor,
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
      const adapter = new OpenAiCompatibleAdapter(config(fixture.baseUrl, 'openrouter'));
      expect((await adapter.testConnection()).ok).toBe(true);
      const models = await adapter.listModels();
      expect(models.map((model) => model.externalId)).toContain('fixture/text');
      expect(models.find((model) => model.externalId === 'fixture/text')?.capabilities).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ capability: 'vision', supported: true }),
          expect.objectContaining({ capability: 'thinking', supported: true }),
        ]),
      );
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
      expect(fixture.requests.find((request) => request.path === '/embeddings')?.body).toMatchObject({
        model: 'fixture/embed',
        dimensions: 3,
        encoding_format: 'float',
      });
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

/**
 * Provider-neutral tool-call conformance (028, FR-008).
 *
 * One table run against every adapter that declares native tool support, so
 * adding a provider means adding a row rather than a new test file. The point
 * of these cases is that the runtime above them can stay vendor-blind: if an
 * adapter passes here, switching to it changes no tool, permission, or review
 * behaviour (SC-001, SC-002).
 */
/** Loosely-typed view of a provider request body, so the table can inspect two
 * different wire formats without pretending they share a schema. */
type WireBody = {
  tools?: Array<{ name?: string; description?: string; function?: { name?: string } }>;
  messages?: Array<{
    role?: string;
    content?: unknown;
    tool_call_id?: string;
  }>;
};
type ResultCarrier = { role: string; callId: string; content: string } | null;

const TOOL_ADAPTERS: Array<{
  name: string;
  kind: ProviderRuntimeConfig['kind'];
  create: (config: ProviderRuntimeConfig) => AiProviderAdapter;
  /** Where the tool declaration lands in the request body. */
  readToolNames: (body: WireBody) => Array<string | undefined>;
  /** Where a submitted tool result lands — the position each format requires
   * for the provider to correlate it with its call. */
  readResultCarrier: (body: WireBody) => ResultCarrier;
}> = [
  {
    name: 'OpenAI-compatible',
    kind: 'openai_compatible',
    create: (config) => new OpenAiCompatibleAdapter(config),
    readToolNames: (body) => (body.tools ?? []).map((tool) => tool.function?.name),
    // A standalone `role: "tool"` message carrying tool_call_id.
    readResultCarrier: (body) => {
      const message = (body.messages ?? []).find((entry) => entry.role === 'tool');
      if (!message) return null;
      return {
        role: 'tool',
        callId: String(message.tool_call_id),
        content: String(message.content),
      };
    },
  },
  {
    name: 'Anthropic',
    kind: 'anthropic',
    create: (config) => new AnthropicAdapter(config),
    readToolNames: (body) => (body.tools ?? []).map((tool) => tool.name),
    // A `tool_result` content block inside the following *user* turn.
    readResultCarrier: (body) => {
      for (const message of body.messages ?? []) {
        if (!Array.isArray(message.content)) continue;
        const block = (message.content as Array<Record<string, unknown>>).find(
          (entry) => entry.type === 'tool_result',
        );
        if (block) {
          return {
            role: String(message.role),
            callId: String(block.tool_use_id),
            content: String(block.content),
          };
        }
      }
      return null;
    },
  },
];

const SEARCH_TOOL: NeutralToolDefinition = {
  name: 'search_wiki',
  description: 'Search wiki pages by keyword.',
  inputSchema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
};
const LIST_TOOL: NeutralToolDefinition = {
  name: 'list_pages',
  description: 'List visible wiki pages.',
  inputSchema: { type: 'object', properties: {} },
};

async function collect(stream: AsyncIterable<TextGenerationEvent>) {
  const events: TextGenerationEvent[] = [];
  for await (const event of stream) events.push(event);
  return events;
}

function collectText(events: TextGenerationEvent[]): string {
  return events.map((event) => (event.type === 'delta' ? event.text : '')).join('');
}

function collectToolCalls(events: TextGenerationEvent[]): NeutralToolCall[] {
  return events.flatMap((event) => (event.type === 'tool_call' ? [event.call] : []));
}

function lastBody(fixture: { requests: Array<{ body: unknown }> }): WireBody {
  return (fixture.requests.at(-1)?.body ?? {}) as WireBody;
}

describe.each(TOOL_ADAPTERS)('$name tool conformance', (adapterCase) => {
  const { kind, create, readToolNames, readResultCarrier } = adapterCase;
  const configFor = (baseUrl: string): ProviderRuntimeConfig => ({
    ...config(baseUrl),
    kind,
  });
  const baseInput = (signal: AbortSignal) => ({
    actionId: 'action',
    modelExternalId: 'fixture/text',
    system: 'system',
    messages: [{ role: 'user' as const, content: 'question' }],
    abortSignal: signal,
  });

  it('TC-01: omits tools from the wire entirely when none are offered', async () => {
    const fixture = await startAiProviderFixture({ toolMode: 'single' });
    try {
      const adapter = create(configFor(fixture.baseUrl));
      const events = await collect(adapter.streamText(baseInput(new AbortController().signal)));
      expect(events.some((event) => event.type === 'tool_call')).toBe(false);
      expect(collectText(events)).toBe('fixture answer');
      expect(lastBody(fixture)).not.toHaveProperty('tools');
    } finally {
      await fixture.close();
    }
  });

  it('TC-02: translates definitions without dropping description or schema', async () => {
    const fixture = await startAiProviderFixture({ toolMode: 'single' });
    try {
      const adapter = create(configFor(fixture.baseUrl));
      await collect(
        adapter.streamText({
          ...baseInput(new AbortController().signal),
          tools: [SEARCH_TOOL, LIST_TOOL],
        }),
      );
      const body = lastBody(fixture);
      expect(readToolNames(body)).toEqual(['search_wiki', 'list_pages']);
      expect(JSON.stringify(body.tools)).toContain('Search wiki pages by keyword.');
      expect(JSON.stringify(body.tools)).toContain('"query"');
    } finally {
      await fixture.close();
    }
  });

  it('TC-03/TC-04: emits one complete call per request, ids preserved', async () => {
    const fixture = await startAiProviderFixture({ toolMode: 'single' });
    try {
      const adapter = create(configFor(fixture.baseUrl));
      const events = await collect(
        adapter.streamText({ ...baseInput(new AbortController().signal), tools: [SEARCH_TOOL] }),
      );
      const calls = collectToolCalls(events);
      expect(calls).toHaveLength(1);
      // Arguments arrived split across three chunks; only the whole is valid.
      expect(calls[0]!.arguments).toEqual({ query: 'backup policy' });
      expect(calls[0]!.name).toBe('search_wiki');
      expect(calls[0]!.id).toBeTruthy();
    } finally {
      await fixture.close();
    }
  });

  it('TC-03: surfaces two calls from one assistant message, in order', async () => {
    const fixture = await startAiProviderFixture({ toolMode: 'parallel' });
    try {
      const adapter = create(configFor(fixture.baseUrl));
      const events = await collect(
        adapter.streamText({
          ...baseInput(new AbortController().signal),
          tools: [SEARCH_TOOL, LIST_TOOL],
        }),
      );
      const calls = collectToolCalls(events);
      expect(calls.map((call) => call.name)).toEqual(['search_wiki', 'list_pages']);
      expect(calls[1]!.arguments).toEqual({});
    } finally {
      await fixture.close();
    }
  });

  it('TC-05: serialises results back with their call ids', async () => {
    const fixture = await startAiProviderFixture({ toolMode: 'single' });
    try {
      const adapter = create(configFor(fixture.baseUrl));
      await collect(
        adapter.streamText({
          ...baseInput(new AbortController().signal),
          tools: [SEARCH_TOOL],
          messages: [
            { role: 'user', content: 'question' },
            {
              role: 'assistant',
              content: '',
              toolCalls: [{ id: 'call_1', name: 'search_wiki', arguments: { query: 'backup' } }],
            },
            {
              role: 'user',
              content: '',
              toolResults: [{ callId: 'call_1', ok: true, content: '2 pages', isError: false }],
            },
          ],
        }),
      );
      // Presence is not enough: a result in the wrong position is silently
      // ignored by the provider, which looks like the model forgetting.
      const carrier = readResultCarrier(lastBody(fixture));
      expect(carrier).not.toBeNull();
      expect(carrier!.callId).toBe('call_1');
      expect(carrier!.content).toBe('2 pages');
    } finally {
      await fixture.close();
    }
  });

  it('TC-06: keeps usage and done events during a tool turn', async () => {
    const fixture = await startAiProviderFixture({ toolMode: 'single' });
    try {
      const adapter = create(configFor(fixture.baseUrl));
      const events = await collect(
        adapter.streamText({ ...baseInput(new AbortController().signal), tools: [SEARCH_TOOL] }),
      );
      expect(events.some((event) => event.type === 'done')).toBe(true);
    } finally {
      await fixture.close();
    }
  });

  it('TC-07: a rejected tool payload is recognisable as a tool-support failure', async () => {
    const fixture = await startAiProviderFixture({ toolMode: 'reject' });
    try {
      const adapter = create(configFor(fixture.baseUrl));
      const error = await collect(
        adapter.streamText({ ...baseInput(new AbortController().signal), tools: [SEARCH_TOOL] }),
      ).catch((thrown: unknown) => thrown);
      expect(error).toBeInstanceOf(AiProviderError);
      expect(isNativeToolUnsupportedError(error)).toBe(true);
    } finally {
      await fixture.close();
    }
  });

  it('TC-08: aborting mid-turn surfaces as cancellation with no partial call', async () => {
    const fixture = await startAiProviderFixture({ toolMode: 'single', delayMs: 50 });
    try {
      const adapter = create(configFor(fixture.baseUrl));
      const controller = new AbortController();
      const pending = collect(
        adapter.streamText({ ...baseInput(controller.signal), tools: [SEARCH_TOOL] }),
      );
      controller.abort();
      const outcome = await pending.catch((thrown: unknown) => thrown);
      expect(outcome).toBeInstanceOf(AiProviderError);
      expect((outcome as AiProviderError).code).toBe('CANCELLED');
    } finally {
      await fixture.close();
    }
  });

  it('TC-09: errors never leak the credential', async () => {
    const fixture = await startAiProviderFixture({ toolMode: 'reject' });
    try {
      const adapter = create(configFor(fixture.baseUrl));
      const error = await collect(
        adapter.streamText({ ...baseInput(new AbortController().signal), tools: [SEARCH_TOOL] }),
      ).catch((thrown: unknown) => thrown);
      expect(String((error as Error).message)).not.toContain('test-key');
      expect(JSON.stringify(fixture.requests)).not.toContain('test-key');
    } finally {
      await fixture.close();
    }
  });
});

describe('adapters without native tool support', () => {
  it('declare it, and reject a tool-carrying request rather than dropping the tools', async () => {
    const runtime: ProviderRuntimeConfig = { ...config('http://127.0.0.1:1'), kind: 'voyage' };
    const adapter = new VoyageAdapter(runtime);
    expect(adapter.supportsNativeTools).toBe(false);
    await expect(
      collect(
        adapter.streamText({
          actionId: 'action',
          modelExternalId: 'fixture/text',
          system: 'system',
          messages: [{ role: 'user', content: 'question' }],
          tools: [SEARCH_TOOL],
          abortSignal: new AbortController().signal,
        }),
      ),
    ).rejects.toMatchObject({ code: 'CAPABILITY_UNSUPPORTED' });
  });
});
