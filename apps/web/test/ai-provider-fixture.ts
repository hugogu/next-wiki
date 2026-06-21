import { createServer } from 'node:http';
import { once } from 'node:events';

export async function startAiProviderFixture(options: {
  embeddingDimensions?: number;
  delayMs?: number;
  malformed?: boolean;
} = {}) {
  const requests: Array<{ path: string; body: unknown }> = [];
  const dimensions = options.embeddingDimensions ?? 3;
  const server = createServer(async (request, response) => {
    let raw = '';
    for await (const chunk of request) raw += chunk;
    const body = raw ? JSON.parse(raw) : null;
    requests.push({ path: request.url ?? '/', body });
    if (options.delayMs) await new Promise((resolve) => setTimeout(resolve, options.delayMs));

    if (request.headers.authorization !== 'Bearer test-key') {
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
    if (request.url === '/chat/completions') {
      response.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
      if (options.malformed) return response.end('data: not-json\n\n');
      response.write(`data: ${JSON.stringify({ choices: [{ delta: { content: 'fixture ' } }] })}\n\n`);
      response.write(`data: ${JSON.stringify({ choices: [{ delta: { content: 'answer' }, finish_reason: 'stop' }] })}\n\n`);
      response.end('data: [DONE]\n\n');
      return;
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
