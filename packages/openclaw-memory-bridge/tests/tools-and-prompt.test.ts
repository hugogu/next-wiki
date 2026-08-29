import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerAgentMemoryTools } from '../src/tools';
import { registerPromptEnrichment } from '../src/prompt-enrichment';
import { WikiApiClient, ApiClientError } from '../src/api-client';
import type { BridgeConfig } from '../src/config';

const BASE_CONFIG: BridgeConfig = {
  wikiApiBaseUrl: 'https://wiki.example.com/api/v1',
  credential: 'nwk_secret',
  capture: { enabled: false, modes: [] },
  tools: { enabled: true },
  promptEnrichment: { enabled: true },
};

function stubApi() {
  const tools: Record<string, unknown> = {};
  const hooks = new Map<string, (event: unknown, ctx: unknown) => unknown>();
  return {
    logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    registerTool: vi.fn((tool: { name: string }) => { tools[tool.name] = tool; }),
    on: vi.fn((name: string, handler: (event: unknown, ctx: unknown) => unknown) => { hooks.set(name, handler); }),
    tools,
    hooks,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('registerAgentMemoryTools', () => {
  it('registers no tools when tools.enabled is false', () => {
    const api = stubApi();
    registerAgentMemoryTools(api as never, { ...BASE_CONFIG, tools: { enabled: false } }, new WikiApiClient(BASE_CONFIG));
    expect(api.registerTool).not.toHaveBeenCalled();
  });

  it('registers all four tools as optional when enabled', () => {
    const api = stubApi();
    registerAgentMemoryTools(api as never, BASE_CONFIG, new WikiApiClient(BASE_CONFIG));
    expect(Object.keys(api.tools).sort()).toEqual([
      'agent_memory_forget', 'agent_memory_save', 'agent_memory_search', 'agent_memory_status',
    ]);
    for (const call of api.registerTool.mock.calls) {
      expect(call[1]).toEqual({ optional: true });
    }
  });

  it('search tool queries this key\'s bound destination', async () => {
    const fetchMock = vi.fn().mockImplementation(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      expect(body).not.toHaveProperty('scope');
      return new Response(JSON.stringify({ results: [] }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const api = stubApi();
    registerAgentMemoryTools(api as never, BASE_CONFIG, new WikiApiClient(BASE_CONFIG));
    const search = api.tools.agent_memory_search as { execute: (id: string, params: unknown) => Promise<{ details: unknown }> };
    const result = await search.execute('call-1', { query: 'decision' });
    expect(result.details).toMatchObject({ ok: true, count: 0 });
    expect(fetchMock).toHaveBeenCalled();
  });

  it('escapes citation text in search results to prevent prompt/markup injection', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      results: [{ title: '<script>evil</script>', excerpt: 'x', citation: { canonicalUrl: 'https://wiki.example.com/p', revisionId: 'r1' } }],
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const api = stubApi();
    registerAgentMemoryTools(api as never, BASE_CONFIG, new WikiApiClient(BASE_CONFIG));
    const search = api.tools.agent_memory_search as { execute: (id: string, params: unknown) => Promise<{ content: Array<{ text: string }> }> };
    const result = await search.execute('call-1', { query: 'x' });
    expect(result.content[0]!.text).not.toContain('<script>');
    expect(result.content[0]!.text).toContain('&lt;script&gt;');
  });

  it('surfaces a server rejection as a safe error result instead of throwing', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 401 }));
    vi.stubGlobal('fetch', fetchMock);

    const api = stubApi();
    registerAgentMemoryTools(api as never, BASE_CONFIG, new WikiApiClient(BASE_CONFIG));
    const forget = api.tools.agent_memory_forget as { execute: (id: string, params: unknown) => Promise<{ details: unknown }> };
    const result = await forget.execute('call-1', { memoryId: '3d6f0a9b-6a2b-4a9d-9e3e-1ddc7f7a1c12' });
    expect(result.details).toMatchObject({ ok: false, code: 'unauthorized' });
  });
});

describe('registerPromptEnrichment', () => {
  it('registers no hook when promptEnrichment.enabled is false', () => {
    const api = stubApi();
    registerPromptEnrichment(api as never, { ...BASE_CONFIG, promptEnrichment: { enabled: false } }, new WikiApiClient(BASE_CONFIG));
    expect(api.on).not.toHaveBeenCalledWith('agent_turn_prepare', expect.any(Function));
  });

  it('safely skips enrichment when the hook context lacks a session id', async () => {
    const api = stubApi();
    registerPromptEnrichment(api as never, BASE_CONFIG, new WikiApiClient(BASE_CONFIG));
    const handler = api.hooks.get('agent_turn_prepare')!;
    const result = await handler({ prompt: 'hello', messages: [], queuedInjections: [] }, {});
    expect(result).toBeUndefined();
    expect(api.logger.debug).toHaveBeenCalledWith(expect.stringContaining('no session correlation'));
  });

  it('appends bounded, escaped, cited context when recall returns results', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      results: [{ title: 'Decision', excerpt: 'Use <b>X</b>', citation: { canonicalUrl: 'https://wiki.example.com/p' } }],
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const api = stubApi();
    registerPromptEnrichment(api as never, BASE_CONFIG, new WikiApiClient(BASE_CONFIG));
    const handler = api.hooks.get('agent_turn_prepare')!;
    const result = await handler({ prompt: 'what did we decide', messages: [], queuedInjections: [] }, { sessionId: 'session-1' }) as { appendContext?: string };
    expect(result?.appendContext).toContain('Decision');
    expect(result?.appendContext).not.toContain('<b>');
    expect(result?.appendContext).toContain('&lt;b&gt;');
  });

  it('never fails the turn when the recall request errors', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new ApiClientError('unavailable', 'down'));
    vi.stubGlobal('fetch', fetchMock);

    const api = stubApi();
    registerPromptEnrichment(api as never, BASE_CONFIG, new WikiApiClient(BASE_CONFIG));
    const handler = api.hooks.get('agent_turn_prepare')!;
    await expect(handler({ prompt: 'hello', messages: [], queuedInjections: [] }, { sessionId: 'session-1' })).resolves.toBeUndefined();
  });
});
