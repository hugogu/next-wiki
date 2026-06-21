import type { PermCtx } from '@/server/permissions';
import { getActionEvents, requireActionAccess } from '@/server/services/ai-actions';

const encoder = new TextEncoder();

export function serializeSseEvent(event: {
  id: number;
  type: string;
  payload: Record<string, unknown>;
}): Uint8Array {
  return encoder.encode(`id: ${event.id}\nevent: ${event.type}\ndata: ${JSON.stringify(event.payload)}\n\n`);
}

export async function createActionEventStream(
  ctx: PermCtx,
  actionId: string,
  after = 0,
): Promise<ReadableStream<Uint8Array>> {
  await requireActionAccess(ctx, actionId);
  let cursor = after;
  let closed = false;
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const deadline = Date.now() + 65_000;
      try {
        while (!closed && Date.now() < deadline) {
          const events = await getActionEvents(ctx, actionId, cursor);
          for (const event of events) {
            cursor = event.id;
            controller.enqueue(serializeSseEvent(event));
            if (['completed', 'error'].includes(event.type)) {
              closed = true;
              break;
            }
          }
          if (closed) break;
          controller.enqueue(encoder.encode(': heartbeat\n\n'));
          await new Promise((resolve) => setTimeout(resolve, 1_000));
        }
      } finally {
        controller.close();
      }
    },
    cancel() {
      closed = true;
    },
  });
}
