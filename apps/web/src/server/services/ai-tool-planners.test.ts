import { startAiProviderFixture } from '../../../test/ai-provider-fixture';
import { OpenAiCompatibleAdapter } from '@/server/ai/providers/openai-compatible';
import type { ProviderRuntimeConfig } from '@/server/ai/types';
import { listToolDefinitions } from '@/server/services/ai-tool-registry';
import { createNativeToolPlanner, createTextProtocolPlanner, type PlannerDeps } from './ai-tool-planners';
import {
  MAX_TOOL_RESULT_CHARS,
  formatToolResultForModel,
  type ToolTurnState,
} from './ai-tool-runtime';

/**
 * Planner equivalence (028, FR-004).
 *
 * The two planners are the only place where the choice of strategy is visible.
 * Everything downstream — `runToolLoop`, policy resolution, review, audit, chat
 * events, citations — is literally the same code path consuming the same
 * `ToolPlanStep`, so proving the step is identical at this boundary is what
 * proves the user-visible behaviour is identical. A divergence anywhere below
 * here would have to be a divergence in shared code, which no strategy can
 * cause.
 */

function config(baseUrl: string): ProviderRuntimeConfig {
  return {
    providerId: '00000000-0000-4000-8000-000000000001',
    name: 'Fixture',
    type: 'chat',
    vendor: 'custom',
    kind: 'openai_compatible',
    baseUrl,
    config: {},
    credentials: { apiKey: 'test-key' },
  };
}

const STATE: ToolTurnState = {
  question: 'What is our backup policy?',
  conversation: [],
  wikiSources: [],
  transcript: [],
};

function deps(baseUrl: string, reasoning: string[], usage: number[]): PlannerDeps {
  return {
    adapter: new OpenAiCompatibleAdapter(config(baseUrl)),
    actionId: 'action',
    modelExternalId: 'fixture/text',
    system: 'system',
    abortSignal: new AbortController().signal,
    maxOutputTokens: () => 1024,
    onReasoning: async (text) => {
      reasoning.push(text);
    },
    onUsage: (event) => {
      if (typeof event.outputTokens === 'number') usage.push(event.outputTokens);
    },
  };
}

// The same request expressed in each protocol: the model asks to search the
// wiki for "backup policy".
const TEXT_PROTOCOL_TOOL_BLOCK = [
  '```tool',
  'tool_calls:',
  '  - tool: search_wiki',
  '    arguments:',
  '      query: "backup policy"',
  '    review: none',
  '```',
].join('\n');

describe('planner equivalence', () => {
  it('produces an identical tool-call step from either protocol', async () => {
    const nativeFixture = await startAiProviderFixture({ toolMode: 'single' });
    const textFixture = await startAiProviderFixture({ textResponse: TEXT_PROTOCOL_TOOL_BLOCK });
    try {
      const nativeStep = await createNativeToolPlanner({
        ...deps(nativeFixture.baseUrl, [], []),
        tools: () => listToolDefinitions().filter((tool) => tool.name === 'search_wiki'),
      })(STATE);
      const textStep = await createTextProtocolPlanner(deps(textFixture.baseUrl, [], []))(STATE);

      expect(nativeStep).toEqual(textStep);
      expect(nativeStep).toEqual({
        kind: 'tool_calls',
        calls: [
          {
            toolName: 'search_wiki',
            arguments: { query: 'backup policy' },
            requestedReview: 'none',
          },
        ],
      });
    } finally {
      await nativeFixture.close();
      await textFixture.close();
    }
  });

  it('produces an identical final step from either protocol', async () => {
    const nativeFixture = await startAiProviderFixture({ textResponse: 'The policy is nightly.' });
    const textFixture = await startAiProviderFixture({ textResponse: 'The policy is nightly.' });
    try {
      const nativeStep = await createNativeToolPlanner({
        ...deps(nativeFixture.baseUrl, [], []),
        tools: () => listToolDefinitions().filter((tool) => tool.name === 'search_wiki'),
      })(STATE);
      const textStep = await createTextProtocolPlanner(deps(textFixture.baseUrl, [], []))(STATE);

      expect(nativeStep).toEqual(textStep);
      expect(nativeStep).toEqual({ kind: 'final', text: 'The policy is nightly.' });
    } finally {
      await nativeFixture.close();
      await textFixture.close();
    }
  });

  it('does not expose an unfenced tool protocol as a native-planner answer', async () => {
    const fixture = await startAiProviderFixture({
      textResponse: 'tool_calls:\n  - tool: search_wiki\n    arguments:\n      query: "backup"',
    });
    try {
      await expect(createNativeToolPlanner({
        ...deps(fixture.baseUrl, [], []),
        tools: () => listToolDefinitions().filter((tool) => tool.name === 'search_wiki'),
      })(STATE)).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
    } finally {
      await fixture.close();
    }
  });

  it('offers the same tool catalogue in both protocols', async () => {
    const fixture = await startAiProviderFixture({ toolMode: 'single' });
    try {
      const tools = listToolDefinitions().filter((tool) =>
        ['search_wiki', 'get_page'].includes(tool.name),
      );
      await createNativeToolPlanner({
        ...deps(fixture.baseUrl, [], []),
        tools: () => tools,
      })(STATE);
      const body = fixture.requests.at(-1)?.body as {
        tools?: Array<{ function?: { name?: string; description?: string } }>;
      };
      // Names and descriptions are the registry's, not a planner's invention,
      // which is what keeps the two catalogues from drifting apart.
      expect(body.tools?.map((tool) => tool.function?.name)).toEqual(tools.map((t) => t.name));
      expect(body.tools?.map((tool) => tool.function?.description)).toEqual(
        tools.map((t) => t.description),
      );
    } finally {
      await fixture.close();
    }
  });

  it('removes tools unavailable for the remainder of the turn from the native catalogue', async () => {
    const fixture = await startAiProviderFixture({ toolMode: 'single' });
    try {
      const tools = listToolDefinitions().filter((tool) =>
        ['search_wiki', 'web_search'].includes(tool.name),
      );
      await createNativeToolPlanner({
        ...deps(fixture.baseUrl, [], []),
        tools: (state) => tools.filter(
          (tool) => !state.unavailableToolNames?.includes(tool.name),
        ),
      })({ ...STATE, unavailableToolNames: ['web_search'] });
      const body = fixture.requests.at(-1)?.body as {
        tools?: Array<{ function?: { name?: string } }>;
      };
      expect(body.tools?.map((tool) => tool.function?.name)).toEqual(['search_wiki']);
    } finally {
      await fixture.close();
    }
  });

  it('never lets a native call request less review than the text protocol could', async () => {
    const fixture = await startAiProviderFixture({ toolMode: 'single' });
    try {
      const step = await createNativeToolPlanner({
        ...deps(fixture.baseUrl, [], []),
        tools: () => listToolDefinitions().filter((tool) => tool.name === 'search_wiki'),
      })(STATE);
      // Native tool calls carry no review field, so the planner asks for
      // nothing and the server decides. `resolveReview` is strictest-wins, so
      // this can only ever result in more review, never less.
      expect(step).toMatchObject({ calls: [{ requestedReview: 'none' }] });
    } finally {
      await fixture.close();
    }
  });

  it('reports usage through the same callback from either protocol', async () => {
    const nativeUsage: number[] = [];
    const textUsage: number[] = [];
    const nativeFixture = await startAiProviderFixture({ textResponse: 'answer' });
    const textFixture = await startAiProviderFixture({ textResponse: 'answer' });
    try {
      await createNativeToolPlanner({
        ...deps(nativeFixture.baseUrl, [], nativeUsage),
        tools: () => [],
      })(STATE);
      await createTextProtocolPlanner(deps(textFixture.baseUrl, [], textUsage))(STATE);
      expect(nativeUsage).toEqual(textUsage);
    } finally {
      await nativeFixture.close();
      await textFixture.close();
    }
  });
});

describe('tool result rendering', () => {
  it('bounds a large result and marks the truncation in-band', () => {
    const wide = { rows: Array.from({ length: 5_000 }, (_, i) => ({ id: i, title: `page ${i}` })) };
    const rendered = formatToolResultForModel('list_pages', { summary: '5000 pages', data: wide });
    expect(rendered.truncated).toBe(true);
    expect(rendered.text.length).toBeLessThan(MAX_TOOL_RESULT_CHARS + 300);
    // The model must be able to tell "that is all" from "there was more".
    expect(rendered.text).toContain('[truncated:');
  });

  it('leaves a small result untouched', () => {
    const rendered = formatToolResultForModel('get_page', { summary: '1 page', data: { id: 'p1' } });
    expect(rendered.truncated).toBe(false);
    expect(rendered.text).not.toContain('[truncated:');
    expect(rendered.text).toContain('get_page');
  });
});
