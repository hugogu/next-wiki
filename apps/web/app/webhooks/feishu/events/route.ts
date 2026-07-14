import { getFeishuTransport } from '@/server/feishu/transport';
import { processWebhook } from '@/server/feishu/webhook-handler';

// The signed Feishu Event v2 callback. Not part of the public REST/OpenAPI
// surface; it returns no Wiki content. Always dynamic (never cached/prerendered).
export const dynamic = 'force-dynamic';

export async function POST(req: Request): Promise<Response> {
  const rawBody = await req.text();
  const transport = await getFeishuTransport();
  // Integration disabled or unconfigured: acknowledge without any side effect so
  // Feishu does not retry, and the default deployment stays inert.
  if (!transport) return new Response('ok', { status: 200 });

  const headers: Record<string, string | undefined> = {};
  req.headers.forEach((value, key) => {
    headers[key.toLowerCase()] = value;
  });

  const result = await processWebhook({ transport, rawBody, headers });
  if (typeof result.body === 'string') {
    return new Response(result.body, { status: result.status });
  }
  return Response.json(result.body, { status: result.status });
}
