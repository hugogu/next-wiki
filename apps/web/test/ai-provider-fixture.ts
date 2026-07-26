import { createServer } from 'node:http';
import { once } from 'node:events';

/**
 * How the fixture should answer a tool-bearing request (028).
 *
 * - `none`      — behave as before, plain text only.
 * - `single`    — one tool call whose JSON arguments arrive split across three
 *                 stream chunks, exercising fragment accumulation.
 * - `parallel`  — two tool calls in one assistant message.
 * - `reject`    — refuse the tool payload, so the caller can prove it downgrades
 *                 to the text protocol instead of failing the user's turn.
 */
export type FixtureToolMode = 'none' | 'single' | 'parallel' | 'reject';

export async function startAiProviderFixture(options: {
  embeddingDimensions?: number;
  delayMs?: number;
  malformed?: boolean;
  toolMode?: FixtureToolMode;
} = {}) {
  const requests: Array<{ path: string; body: unknown }> = [];
  const dimensions = options.embeddingDimensions ?? 3;
  const toolMode = options.toolMode ?? 'none';
  const server = createServer(async (request, response) => {
    let raw = '';
    for await (const chunk of request) raw += chunk;
    const body = raw ? JSON.parse(raw) : null;
    requests.push({ path: request.url ?? '/', body });
    if (options.delayMs) await new Promise((resolve) => setTimeout(resolve, options.delayMs));

    const authorized =
      request.headers.authorization === 'Bearer test-key' ||
      request.headers['x-api-key'] === 'test-key';
    if (!authorized) {
      response.writeHead(401, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ error: { message: 'invalid credential' } }));
      return;
    }
    if (request.url?.startsWith('/models')) {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ data: [
        {
          id: 'fixture/text',
          name: 'Fixture Text',
          context_length: 32_000,
          supports_image_in: true,
          supports_reasoning: true,
          architecture: { input_modalities: ['text'], output_modalities: ['text'] },
        },
        { id: 'fixture/embed', name: 'Fixture Embedding', embedding_dimensions: dimensions, architecture: { input_modalities: ['text'], output_modalities: ['embeddings'] } },
        { id: 'fixture/image', name: 'Fixture Image', architecture: { input_modalities: ['text'], output_modalities: ['image'] } },
      ] }));
      return;
    }
    if (request.url === '/embeddings') {
      const inputs = Array.isArray(body?.input) ? body.input : [body?.input];
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({
        data: inputs.map((_: unknown, index: number) => ({
          index,
          embedding: options.malformed
            ? [null]
            : Array.from({ length: dimensions }, (_unused, i) => (i + index + 1) / 10),
        })),
        usage: { prompt_tokens: inputs.length },
      }));
      return;
    }
    if (request.url === '/images/generations') {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ data: [{ b64_json: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2jZsAAAAASUVORK5CYII=' }] }));
      return;
    }
    // ---- Anthropic Messages ------------------------------------------------
    if (request.url === '/messages') {
      const wantsTools = Array.isArray(body?.tools) && body.tools.length > 0;
      if (wantsTools && toolMode === 'reject') {
        response.writeHead(400, { 'content-type': 'application/json' });
        response.end(
          JSON.stringify({ error: { message: 'tools: this model does not support tool use' } }),
        );
        return;
      }
      response.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
      if (options.malformed) return response.end('data: not-json\n\n');
      if (wantsTools && toolMode !== 'none') {
        for (const block of anthropicToolBlocks(toolMode)) response.write(`data: ${block}\n\n`);
        response.write(
          `data: ${JSON.stringify({ type: 'message_delta', delta: { stop_reason: 'tool_use' } })}\n\n`,
        );
        return response.end();
      }
      response.write(
        `data: ${JSON.stringify({ type: 'content_block_delta', delta: { type: 'text_delta', text: 'fixture ' } })}\n\n`,
      );
      response.write(
        `data: ${JSON.stringify({ type: 'content_block_delta', delta: { type: 'text_delta', text: 'answer' } })}\n\n`,
      );
      response.write(
        `data: ${JSON.stringify({ type: 'message_delta', delta: { stop_reason: 'end_turn' } })}\n\n`,
      );
      return response.end();
    }
    // ---- OpenAI-compatible chat completions --------------------------------
    if (request.url === '/chat/completions') {
      const wantsTools = Array.isArray(body?.tools) && body.tools.length > 0;
      if (wantsTools && toolMode === 'reject') {
        response.writeHead(400, { 'content-type': 'application/json' });
        response.end(
          JSON.stringify({ error: { message: 'tool_calls are not supported by this model' } }),
        );
        return;
      }
      response.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
      if (options.malformed) return response.end('data: not-json\n\n');
      if (wantsTools && toolMode !== 'none') {
        for (const frame of openAiToolFrames(toolMode)) response.write(`data: ${frame}\n\n`);
        return response.end('data: [DONE]\n\n');
      }
      response.write(`data: ${JSON.stringify({ choices: [{ delta: { content: 'fixture ' } }] })}\n\n`);
      response.write(`data: ${JSON.stringify({ choices: [{ delta: { content: 'answer' }, finish_reason: 'stop' }] })}\n\n`);
      return response.end('data: [DONE]\n\n');
    }
    response.writeHead(404, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ error: { message: 'not found' } }));
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Fixture failed to listen');
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    requests,
    close: async () => {
      server.close();
      server.closeAllConnections();
      await once(server, 'close');
    },
  };
}

/** OpenAI streams tool calls as indexed fragments; arguments arrive as partial
 * JSON strings that only parse once concatenated. */
function openAiToolFrames(mode: FixtureToolMode): string[] {
  const first = [
    { index: 0, id: 'call_search', type: 'function', function: { name: 'search_wiki', arguments: '' } },
    { index: 0, function: { arguments: '{"query":' } },
    { index: 0, function: { arguments: '"backup po' } },
    { index: 0, function: { arguments: 'licy"}' } },
  ];
  const second = [
    { index: 1, id: 'call_list', type: 'function', function: { name: 'list_pages', arguments: '{}' } },
  ];
  const fragments = mode === 'parallel' ? [...first, ...second] : first;
  return [
    ...fragments.map((fragment) =>
      JSON.stringify({ choices: [{ delta: { tool_calls: [fragment] } }] }),
    ),
    JSON.stringify({ choices: [{ delta: {}, finish_reason: 'tool_calls' }] }),
  ];
}

/** Anthropic streams a `tool_use` block whose input arrives as
 * `input_json_delta` partial JSON between start and stop events. */
function anthropicToolBlocks(mode: FixtureToolMode): string[] {
  const blocks = [
    JSON.stringify({
      type: 'content_block_start',
      index: 0,
      content_block: { type: 'tool_use', id: 'toolu_search', name: 'search_wiki' },
    }),
    JSON.stringify({
      type: 'content_block_delta',
      index: 0,
      delta: { type: 'input_json_delta', partial_json: '{"query":' },
    }),
    JSON.stringify({
      type: 'content_block_delta',
      index: 0,
      delta: { type: 'input_json_delta', partial_json: '"backup po' },
    }),
    JSON.stringify({
      type: 'content_block_delta',
      index: 0,
      delta: { type: 'input_json_delta', partial_json: 'licy"}' },
    }),
    JSON.stringify({ type: 'content_block_stop', index: 0 }),
  ];
  if (mode !== 'parallel') return blocks;
  return [
    ...blocks,
    JSON.stringify({
      type: 'content_block_start',
      index: 1,
      content_block: { type: 'tool_use', id: 'toolu_list', name: 'list_pages' },
    }),
    JSON.stringify({
      type: 'content_block_delta',
      index: 1,
      delta: { type: 'input_json_delta', partial_json: '{}' },
    }),
    JSON.stringify({ type: 'content_block_stop', index: 1 }),
  ];
}
